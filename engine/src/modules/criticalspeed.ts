/**
 * modules/criticalspeed.ts — Critical Speed model.
 *
 * Two-parameter hyperbolic model:
 *   D = CS * T + D'
 *   CS = (D2 - D1) / (T2 - T1)      m/s
 *   D' = D1 - CS * T1               m (anaerobic distance reserve)
 *   T_target = (D_target - D') / CS
 *
 * Monod & Scherrer (1965); Jones et al. (2010).
 *
 * The constant-D' assumption holds over roughly 2-30 minutes. Beyond that the
 * model degrades, so we flag VALID_RANGE rather than pretending otherwise.
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { CALIBRATION, SOURCES } from '../models/config.js';
import type { Metres, Seconds } from '../units.js';

const csModel = (params: Record<string, number | string> = {}) => ({
  id: 'criticalSpeed',
  version: '1.0.0',
  calibration: CALIBRATION.criticalSpeed,
  params,
  source: `critical speed: ${SOURCES.criticalSpeed.citation}`,
});

/** Minimum separation in duration for a stable fit. Below this, CS is noise. */
export const MIN_DELTA_SECONDS = 120;

const DEPENDABLE_MIN_SECONDS = 120;
const DEPENDABLE_MAX_SECONDS = 1800;

export interface CriticalSpeedFit {
  /** m/s */
  readonly criticalSpeed: number;
  /** Anaerobic distance reserve, metres. */
  readonly dPrime: number;
  readonly prov: Provenance;
}

export interface CsInput {
  readonly distanceM: Metres;
  readonly timeS: Seconds;
}

/** Fit CS and D' from two efforts of clearly different duration. */
export const fitCriticalSpeed = (
  a: CsInput,
  b: CsInput,
  computedAt: string,
): Result<CriticalSpeedFit> => {
  for (const e of [a, b]) {
    if (!Number.isFinite(e.distanceM) || e.distanceM <= 0) {
      return err('DISTANCE_NOT_POSITIVE', 'Every effort needs a positive distance.', {
        field: 'distance',
      });
    }
    if (!Number.isFinite(e.timeS) || e.timeS <= 0) {
      return err('DURATION_NOT_POSITIVE', 'Every effort needs a positive time.', {
        field: 'duration',
      });
    }
  }

  // Order by duration so the arithmetic is unambiguous.
  const short = a.timeS <= b.timeS ? a : b;
  const long = a.timeS <= b.timeS ? b : a;
  const deltaT = long.timeS - short.timeS;

  if (deltaT < MIN_DELTA_SECONDS) {
    return err(
      'CS_INPUTS_TOO_CLOSE',
      'Those two efforts are too similar in duration. Use efforts about 3-4x apart ' +
        '(for example a 3 km and a 10 km).',
    );
  }

  const cs = (long.distanceM - short.distanceM) / deltaT;
  const dPrime = short.distanceM - cs * short.timeS;

  if (!(cs > 0)) {
    return err(
      'OUT_OF_VALID_RANGE',
      'The longer effort is slower in a way that makes critical speed negative — ' +
        'check the results.',
    );
  }

  const warnings: Warning[] = [];
  if (dPrime < 0) {
    warnings.push(
      warn(
        'VALID_RANGE',
        'Negative anaerobic reserve suggests the two results are inconsistent ' +
          '(different conditions, or one was not a maximal effort).',
      ),
    );
  }
  if (short.timeS < DEPENDABLE_MIN_SECONDS) {
    warnings.push(
      warn('VALID_RANGE', 'The shorter effort is under 2 minutes — below the model range.'),
    );
  }

  return ok({
    criticalSpeed: cs,
    dPrime,
    prov: provenance(
      [csModel({ shortS: short.timeS, longS: long.timeS })],
      computedAt,
      warnings,
    ),
  });
};

/** Predict time at a target distance from a fitted CS/D'. */
export const predictFromCriticalSpeed = (
  fit: CriticalSpeedFit,
  targetDistanceM: Metres,
  computedAt: string,
): Result<{ seconds: number; prov: Provenance }> => {
  if (!Number.isFinite(targetDistanceM) || targetDistanceM <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(fit.criticalSpeed) || fit.criticalSpeed <= 0) {
    return err('OUT_OF_VALID_RANGE', 'Critical speed must be positive.');
  }

  const seconds = (targetDistanceM - fit.dPrime) / fit.criticalSpeed;

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return err(
      'OUT_OF_VALID_RANGE',
      "That distance is shorter than the anaerobic reserve D' — the model cannot " +
        'describe an effort this short.',
    );
  }

  const warnings: Warning[] = [];
  if (seconds > DEPENDABLE_MAX_SECONDS) {
    warnings.push(
      warn(
        'VALID_RANGE',
        "That duration is beyond the model's dependable range (2-30 min). Critical " +
          'speed assumes a fixed anaerobic reserve, which stops holding at longer ' +
          'durations — treat this as optimistic.',
      ),
    );
  }
  if (seconds < DEPENDABLE_MIN_SECONDS) {
    warnings.push(
      warn('VALID_RANGE', 'Efforts under 2 minutes are dominated by anaerobic capacity.'),
    );
  }

  return ok({
    seconds,
    prov: provenance([csModel({ targetDistanceM })], computedAt, warnings),
  });
};

export interface CsZoneBands {
  readonly easy: { readonly low: number; readonly high: number };
  readonly marathon: { readonly low: number; readonly high: number };
  readonly threshold: { readonly low: number; readonly high: number };
  readonly interval: { readonly low: number; readonly high: number };
  readonly repetition: { readonly low: number; readonly high: number };
}

/**
 * CS-derived training zones as fractions of critical speed.
 * Values are SPEEDS (larger = faster), so callers must invert for pace.
 */
export const csZones = (criticalSpeed: number): CsZoneBands => ({
  easy: { low: 0.6 * criticalSpeed, high: 0.75 * criticalSpeed },
  marathon: { low: 0.78 * criticalSpeed, high: 0.86 * criticalSpeed },
  threshold: { low: 0.9 * criticalSpeed, high: 0.97 * criticalSpeed },
  interval: { low: 1.0 * criticalSpeed, high: 1.05 * criticalSpeed },
  repetition: { low: 1.1 * criticalSpeed, high: 1.25 * criticalSpeed },
});
