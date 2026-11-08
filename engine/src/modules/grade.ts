/**
 * modules/grade.ts — Grade Adjusted Pace (GAP).
 *
 * MODEL: Minetti et al. (2002) running energy-cost polynomial.
 *
 *   C(i) = 155.4*i^5 - 30.4*i^4 - 43.3*i^3 + 46.3*i^2 + 19.5*i + 3.6
 *
 *   C = metabolic cost of running, J/kg/m
 *   i = gradient as a decimal (+0.10 = +10%)
 *
 *   cost ratio = C(i) / C(0)
 *   GAP        = actual pace / cost ratio
 *
 * ⚠️ A CORRUPTED VARIANT OF THIS POLYNOMIAL IS WIDELY CIRCULATED:
 *    (155.4, -30.4, -32.8, +43.7, +53.3, 156.46)
 * The constant term 156.46 is the tell. Minetti measured level running at
 * 3.40 +/- 0.24 J/kg/m, so a constant of ~156 is off by a factor of ~43 and
 * produces a cost curve that is nearly flat with grade — it implies only ~1.8%
 * extra energy at +5% where the real curve gives ~30%. Any implementation
 * carrying 156.46 should be treated as broken.
 *
 * VALIDATION: checked against the paper's own measured anchors in
 * test/calibration/gap.validation.test.ts. All four land within one SD.
 *
 * DIVERGENCE FROM STRAVA: Strava abandoned Minetti in 2017 for a heart-rate
 * fitted curve, which gives less credit on descents and rebounds at a shallower
 * grade. Differences on steep downhills are expected, not bugs. We use the
 * published curve because it is citable and reproducible.
 *
 * KNOWN LIMITS, all surfaced as warnings:
 *   - Cost is assumed independent of speed. At very steep grades the model
 *     implies flat-equivalent paces no human can run.
 *   - Above ~+15% most people walk; the polynomial does not model gait change,
 *     so GAP there is meaningful only as a RELATIVE comparison.
 *   - Surface (rock, sand, technical trail) is not modelled at all.
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { CALIBRATION, GRADE, SOURCES } from '../models/config.js';
import { asGrade, type Grade, type SecPerMetre } from '../units.js';

const gradeModel = (params: Record<string, number | string | boolean> = {}) => ({
  id: 'grade.minetti',
  version: GRADE.version,
  calibration: CALIBRATION.grade,
  params: { ...GRADE.polynomial, ...params },
  source: `grade: ${SOURCES.minetti.citation}`,
});

/**
 * Metabolic cost of running at a gradient, J/kg/m.
 * Evaluates the Minetti polynomial directly. C(0) = 3.6.
 */
export const costOfRunning = (grade: Grade): number => {
  const i = grade as number;
  const { c5, c4, c3, c2, c1, c0 } = GRADE.polynomial;
  return c5 * i ** 5 + c4 * i ** 4 + c3 * i ** 3 + c2 * i ** 2 + c1 * i + c0;
};

/** Cost at level running, the denominator of every ratio. */
export const FLAT_COST = GRADE.polynomial.c0;

/** Energy cost ratio (cost on slope / cost on flat). Exactly 1.0 at grade 0. */
export const costRatio = (grade: Grade): number => costOfRunning(grade) / FLAT_COST;

export interface GapResult {
  /** Flat-equivalent pace, s/m. */
  readonly gapSpm: number;
  /** Actual pace on the slope, s/m. */
  readonly actualSpm: number;
  readonly ratio: number;
  readonly grade: number;
  readonly prov: Provenance;
}

/** Clamp to the measured range and collect the right warnings. */
const clampGrade = (i: number): { clamped: number; warnings: Warning[] } => {
  const warnings: Warning[] = [];
  const { min, max } = GRADE.measuredRange;
  const { min: vMin, max: vMax } = GRADE.wellValidatedRange;

  let clamped = i;

  if (i > max) {
    clamped = max;
    warnings.push(
      warn(
        'VALID_RANGE',
        `Grade above +${Math.round(max * 100)}% is outside the measured range — clamped.`,
      ),
    );
  } else if (i < min) {
    clamped = min;
    warnings.push(
      warn(
        'VALID_RANGE',
        `Grade below ${Math.round(min * 100)}% is outside the measured range — clamped.`,
      ),
    );
  } else if (i > vMax || i < vMin) {
    warnings.push(
      warn(
        'VALID_RANGE',
        `Beyond +/-${Math.round(vMax * 100)}% the polynomial is extrapolating past the ` +
          'well-validated range. Treat the number as approximate.',
      ),
    );
  }

  return { clamped, warnings };
};

/**
 * Convert actual pace on a slope to flat-equivalent pace.
 *
 * Pace is the RECIPROCAL of speed, so the cost ratio DIVIDES pace:
 *   uphill   (ratio > 1) -> GAP is a faster pace (smaller number)
 *   downhill (ratio < 1) -> GAP is a slower pace
 */
export const toGap = (
  actualSpm: SecPerMetre,
  grade: Grade,
  computedAt: string,
): Result<GapResult> => {
  if (!Number.isFinite(actualSpm) || actualSpm <= 0) {
    return err('PACE_NOT_POSITIVE', 'Pace must be greater than zero.', { field: 'pace' });
  }

  const i = grade as number;
  if (!Number.isFinite(i)) {
    return err('OUT_OF_VALID_RANGE', 'Grade must be a number.');
  }

  const { clamped, warnings } = clampGrade(i);

  if (clamped >= GRADE.gaitTransitionGrade) {
    warnings.push(
      warn(
        'VALID_RANGE',
        'Above about +15% most runners walk. The cost model assumes running ' +
          'throughout, so this GAP is meaningful only as a relative comparison.',
      ),
    );
  }

  const ratio = costRatio(asGrade(clamped));

  return ok({
    gapSpm: actualSpm / ratio,
    actualSpm,
    ratio,
    grade: clamped,
    prov: provenance([gradeModel({ grade: clamped })], computedAt, warnings),
  });
};

/** Inverse: the actual pace you would run on a slope to hold a given flat effort. */
export const fromGap = (
  gapSpm: SecPerMetre,
  grade: Grade,
  computedAt: string,
): Result<{ actualSpm: number; ratio: number; prov: Provenance }> => {
  if (!Number.isFinite(gapSpm) || gapSpm <= 0) {
    return err('PACE_NOT_POSITIVE', 'Pace must be greater than zero.', { field: 'pace' });
  }

  const { clamped, warnings } = clampGrade(grade as number);
  const ratio = costRatio(asGrade(clamped));

  return ok({
    actualSpm: gapSpm * ratio,
    ratio,
    prov: provenance([gradeModel({ grade: clamped })], computedAt, warnings),
  });
};

// ---------------------------------------------------------------------------
// Course-level aggregation. Bridge to the course module.
// ---------------------------------------------------------------------------

export interface CourseBin {
  readonly distanceM: number;
  readonly grade: number;
}

export const courseGapTotal = (
  bins: readonly CourseBin[],
  flatPaceSpm: SecPerMetre,
  computedAt: string,
): Result<{
  totalSeconds: number;
  totalDistanceM: number;
  effectiveGapSpm: number;
  prov: Provenance;
}> => {
  if (bins.length === 0) return err('INSUFFICIENT_INPUT', 'No course bins supplied.');
  if (!Number.isFinite(flatPaceSpm) || flatPaceSpm <= 0) {
    return err('PACE_NOT_POSITIVE', 'Flat pace must be positive.', { field: 'pace' });
  }

  let totalSeconds = 0;
  let totalDistanceM = 0;
  let clampedAny = false;

  for (const bin of bins) {
    if (!Number.isFinite(bin.distanceM) || bin.distanceM <= 0) {
      return err('DISTANCE_NOT_POSITIVE', 'Every bin needs a positive distance.');
    }
    if (!Number.isFinite(bin.grade)) {
      return err('OUT_OF_VALID_RANGE', 'Every bin needs a numeric grade.');
    }

    const { clamped } = clampGrade(bin.grade);
    if (clamped !== bin.grade) clampedAny = true;

    totalSeconds += flatPaceSpm * costRatio(asGrade(clamped)) * bin.distanceM;
    totalDistanceM += bin.distanceM;
  }

  const warnings: Warning[] = clampedAny
    ? [warn('VALID_RANGE', 'Some bins exceeded the measured grade range and were clamped.')]
    : [];

  return ok({
    totalSeconds,
    totalDistanceM,
    effectiveGapSpm: totalSeconds / totalDistanceM,
    prov: provenance([gradeModel({ bins: bins.length })], computedAt, warnings),
  });
};

/** Percentage grade from rise over run. */
export const gradeFromRiseRun = (riseM: number, runM: number): Grade =>
  asGrade(runM === 0 ? 0 : riseM / runM);

/**
 * Grade at which running cost is lowest, solved numerically from the polynomial
 * rather than hardcoded, so it stays correct if coefficients change.
 *
 * Integer-indexed to avoid floating-point accumulation over 300 iterations.
 */
export const minimumCostGrade = (): Grade => {
  const scale = 1000;
  let bestIndex = -300;
  let bestCost = costOfRunning(asGrade(bestIndex / scale));

  for (let index = -299; index <= 0; index += 1) {
    const c = costOfRunning(asGrade(index / scale));
    if (c < bestCost) {
      bestCost = c;
      bestIndex = index;
    }
  }

  return asGrade(bestIndex / scale);
};
