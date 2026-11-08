/**
 * modules/vdot.ts — Jack Daniels VDOT model.
 *
 * Equations (public):
 *   VO2(v)   = a + b*v + c*v^2                       v in metres/minute
 *   %max(t)  = p0 + p1*e^(-k1*t) + p2*e^(-k2*t)      t in minutes
 *   VDOT     = VO2(v) / %max(t)
 *
 * IMPORTANT: VDOT is an EFFECTIVE running-fitness index that absorbs running
 * economy. It is NOT measured VO2max. Never label it "your VO2max".
 *
 * Verified: 5 km in 20:00 -> v = 250 m/min, VO2 = 47.4645, %max(20) = 0.95294,
 * VDOT = 49.81. Daniels' published table gives 49.8. We compute from equations
 * and never transcribe tables.
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { CALIBRATION, SOURCES, VDOT } from '../models/config.js';
import type { Metres, Seconds } from '../units.js';

const { a: A, b: B, c: C } = VDOT.costCoeffs;
const { p0: P0, p1: P1, k1: K1, p2: P2, k2: K2 } = VDOT.sustainable;

const vdotModel = (params: Record<string, number | string> = {}) => ({
  id: 'vdot',
  version: VDOT.version,
  calibration: CALIBRATION.vdot,
  params,
  source: `vdot: ${SOURCES.vdot.citation}`,
});

/** Oxygen cost of running at v metres/minute, mL/kg/min. */
export const oxygenCost = (metresPerMinute: number): number =>
  A + B * metresPerMinute + C * metresPerMinute ** 2;

/** Fraction of VO2max sustainable for t minutes. */
export const fractionSustainable = (minutes: number): number =>
  P0 + P1 * Math.exp(-K1 * minutes) + P2 * Math.exp(-K2 * minutes);

export interface VdotResult {
  readonly vdot: number;
  /** Equivalent VO2 at race pace, mL/kg/min. */
  readonly raceVo2: number;
  readonly speedMps: number;
  readonly prov: Provenance;
}

/** Derive VDOT from a race performance. */
export const computeVdot = (
  distanceM: Metres,
  timeS: Seconds,
  computedAt: string,
): Result<VdotResult> => {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(timeS) || timeS <= 0) {
    return err('DURATION_NOT_POSITIVE', 'Time must be greater than zero.', {
      field: 'duration',
    });
  }

  const minutes = timeS / 60;
  const v = distanceM / minutes;
  const raceVo2 = oxygenCost(v);
  const frac = fractionSustainable(minutes);

  if (!(frac > 0) || !Number.isFinite(frac)) {
    return err('OUT_OF_VALID_RANGE', "That duration is outside the model's valid range.");
  }

  const warnings: Warning[] = [];
  if (minutes < 3.5) {
    warnings.push(
      warn(
        'VALID_RANGE',
        'VDOT from efforts shorter than ~4 minutes is unreliable — the model assumes ' +
          'a predominantly aerobic race.',
      ),
    );
  }
  if (minutes > 240) {
    warnings.push(warn('VALID_RANGE', 'VDOT from efforts longer than 4 hours is unreliable.'));
  }

  return ok({
    vdot: raceVo2 / frac,
    raceVo2,
    speedMps: distanceM / timeS,
    prov: provenance(
      [vdotModel({ distanceM, timeS })],
      computedAt,
      warnings,
    ),
  });
};

/**
 * Invert: given a VDOT and a target distance, find the time.
 *
 * Both terms depend on t, so this needs iteration. f(t) = VO2(D/t)/%max(t) - vdot
 * is decreasing in t over the model's valid range, so bisection is safe.
 */
export const timeForVdot = (
  vdot: number,
  distanceM: Metres,
  computedAt: string,
): Result<{ seconds: number; prov: Provenance }> => {
  if (!Number.isFinite(vdot) || vdot <= 0) {
    return err('OUT_OF_VALID_RANGE', 'VDOT must be greater than zero.');
  }
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Distance must be greater than zero.', {
      field: 'distance',
    });
  }

  const f = (tSeconds: number): number => {
    const minutes = tSeconds / 60;
    const v = distanceM / minutes;
    return oxygenCost(v) / fractionSustainable(minutes) - vdot;
  };

  let lo = VDOT.solveBounds.minMinutes * 60;
  let hi = VDOT.solveBounds.maxMinutes * 60;

  if (f(lo) < 0) {
    return err('OUT_OF_VALID_RANGE', 'VDOT is too low for the solver to bracket a solution.');
  }
  if (f(hi) > 0) {
    return err('OUT_OF_VALID_RANGE', 'VDOT is too high for the solver to bracket a solution.');
  }

  for (let i = 0; i < VDOT.solveMaxIterations; i += 1) {
    const mid = (lo + hi) / 2;
    const value = f(mid);

    if (Math.abs(value) < 1e-10 || hi - lo < VDOT.solveToleranceSeconds) {
      return ok({
        seconds: mid,
        prov: provenance([vdotModel({ vdot, distanceM, iterations: i + 1 })], computedAt),
      });
    }

    // f is decreasing: a positive value means we need a larger t.
    if (value > 0) lo = mid;
    else hi = mid;
  }

  return err('VDOT_SOLVE_FAILED', 'Could not solve for that VDOT and distance.');
};

/** Equivalent performances across standard distances from one result. */
export const equivalentTimes = (
  vdot: number,
  targets: readonly { id: string; m: number }[],
  computedAt: string,
): Result<readonly { id: string; distanceM: number; seconds: number }[]> => {
  const out: { id: string; distanceM: number; seconds: number }[] = [];

  for (const t of targets) {
    const r = timeForVdot(vdot, t.m as Metres, computedAt);
    if (!r.ok) return r;
    out.push({ id: t.id, distanceM: t.m, seconds: r.value.seconds });
  }

  return ok(out);
};
