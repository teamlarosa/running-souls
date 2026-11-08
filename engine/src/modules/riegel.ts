/**
 * modules/riegel.ts — Module PRED, Riegel model (v1 default prediction).
 *
 *   T2 = T1 * (D2 / D1)^k
 *
 * Riegel, P.S. (1981). American Scientist 69(3), 285-290.
 *
 * k = 1.06 is a POPULATION AVERAGE. It is a ceiling for an athlete fully
 * trained for the target distance, and typically under-predicts recreational
 * marathon times. Guardrails live here.
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { CALIBRATION, PREDICTION, RIEGEL, SOURCES } from '../models/config.js';
import type { Metres, Seconds } from '../units.js';

const riegelModel = (k: number) => ({
  id: 'riegel',
  version: RIEGEL.version,
  calibration: CALIBRATION.riegel,
  params: { k, maxReliableRatio: RIEGEL.maxReliableRatio },
  source: `riegel: ${SOURCES.riegel.citation}`,
});

export interface RiegelInput {
  readonly fromDistanceM: Metres;
  readonly fromTimeS: Seconds;
  readonly toDistanceM: Metres;
  /** Endurance exponent. Defaults to RIEGEL.defaultK (decision 3: 1.06). */
  readonly k?: number;
  /** Days since the reference result, for the recency warning. */
  readonly resultAgeDays?: number;
  readonly computedAt: string;
}

export interface Prediction {
  readonly distanceM: number;
  readonly seconds: number;
  /** Half-width of the confidence band, in seconds. */
  readonly uncertaintyS: number;
  readonly prov: Provenance;
}

const recencyWarning = (ageDays?: number): Warning | null => {
  if (ageDays === undefined) return null;
  if (ageDays >= PREDICTION.recency.staleDays) {
    return warn(
      'STALE_RESULT',
      'That reference result is more than 18 months old — treat this as a rough guide.',
    );
  }
  return null;
};

export const predictRiegel = (input: RiegelInput): Result<Prediction> => {
  const { fromDistanceM: d1, fromTimeS: t1, toDistanceM: d2, computedAt } = input;
  const k = input.k ?? RIEGEL.defaultK;

  if (!Number.isFinite(d1) || d1 <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Reference distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(t1) || t1 <= 0) {
    return err('DURATION_NOT_POSITIVE', 'Reference time must be greater than zero.', {
      field: 'duration',
    });
  }
  if (!Number.isFinite(d2) || d2 <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Target distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(k) || k < 1 || k > 1.3) {
    return err('OUT_OF_VALID_RANGE', 'Endurance exponent must be between 1.0 and 1.3.');
  }

  const ratio = d2 / d1;

  if (ratio > RIEGEL.hardRatioLimit) {
    return err(
      'OUT_OF_VALID_RANGE',
      `That is a ${ratio.toFixed(0)}x distance jump. Predictions this far from the ` +
        'reference result are not meaningful — enter a closer race result.',
    );
  }

  const seconds = t1 * ratio ** k;

  // Uncertainty band widens with the extrapolation ratio.
  const u = PREDICTION.uncertainty;
  const uncertaintyFraction =
    ratio > RIEGEL.maxReliableRatio
      ? u.extrapolationBeyond4x
      : ratio > 2
        ? u.interpolationWithin4x
        : u.interpolationWithin2x;

  const warnings: Warning[] = [];

  if (ratio > RIEGEL.maxReliableRatio) {
    warnings.push(
      warn(
        'EXTRAPOLATION',
        `${ratio.toFixed(1)}x the reference distance. Riegel himself cautioned against ` +
          'extrapolating this far — this reads as a ceiling, not an expectation.',
      ),
    );
  } else if (ratio < 1 / RIEGEL.maxReliableRatio) {
    warnings.push(
      warn(
        'EXTRAPOLATION',
        'Predicting a much shorter race from a longer one is unreliable; short races ' +
          'depend on speed the long result does not reveal.',
      ),
    );
  }

  const recency = recencyWarning(input.resultAgeDays);
  if (recency) warnings.push(recency);

  if (k !== RIEGEL.defaultK) {
    warnings.push(
      warn('VALID_RANGE', `Endurance exponent set to ${k} (default is ${RIEGEL.defaultK}).`),
    );
  }

  return ok({
    distanceM: d2,
    seconds,
    uncertaintyS: seconds * uncertaintyFraction,
    prov: provenance([riegelModel(k)], computedAt, warnings),
  });
};

// ---------------------------------------------------------------------------
// Personal endurance exponent
// ---------------------------------------------------------------------------

export interface RaceResult {
  readonly distanceM: number;
  readonly timeS: number;
  readonly ageDays?: number;
}

export interface FittedExponent {
  readonly k: number;
  readonly a: number;
  /** Coefficient of determination, 0..1. */
  readonly r2: number;
  readonly n: number;
  readonly prov: Provenance;
}

/**
 * Fit an athlete's PERSONAL endurance exponent from their own race history.
 *
 *   log(T) = log(a) + k * log(D)
 *
 * A two-parameter weighted least squares in log-log space — not machine
 * learning. The single most defensible differentiator available, because it is
 * individual.
 */
export const fitPersonalExponent = (
  results: readonly RaceResult[],
  computedAt: string,
): Result<FittedExponent> => {
  const valid = results.filter(
    (r) =>
      Number.isFinite(r.distanceM) &&
      r.distanceM > 0 &&
      Number.isFinite(r.timeS) &&
      r.timeS > 0,
  );

  if (valid.length < 3) {
    return err(
      'INSUFFICIENT_INPUT',
      'Fitting a personal exponent needs at least three race results.',
    );
  }

  // Recency weights: full weight, decaying to 0.5 at 12 months.
  const weightOf = (ageDays?: number): number => {
    if (ageDays === undefined) return 1;
    const { fullWeightDays, halfWeightDays } = PREDICTION.recency;
    if (ageDays <= fullWeightDays) return 1;
    if (ageDays >= halfWeightDays) return 0.5;
    const frac = (ageDays - fullWeightDays) / (halfWeightDays - fullWeightDays);
    return 1 - 0.5 * frac;
  };

  let sw = 0;
  let swx = 0;
  let swy = 0;
  let swxx = 0;
  let swxy = 0;
  let swyy = 0;

  for (const r of valid) {
    const w = weightOf(r.ageDays);
    const x = Math.log(r.distanceM);
    const y = Math.log(r.timeS);
    sw += w;
    swx += w * x;
    swy += w * y;
    swxx += w * x * x;
    swxy += w * x * y;
    swyy += w * y * y;
  }

  const denom = sw * swxx - swx * swx;
  if (Math.abs(denom) < 1e-12) {
    return err(
      'OUT_OF_VALID_RANGE',
      'Those race results are too similar in distance to fit a trend — include a short ' +
        'race and a long race.',
    );
  }

  const k = (sw * swxy - swx * swy) / denom;
  const logA = (swy - k * swx) / sw;

  const ssTot = swyy - (swy * swy) / sw;
  const ssRes = swyy - logA * swy - k * swxy;
  const r2 = ssTot > 1e-12 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;

  const warnings: Warning[] = [];
  if (k < 1.0 || k > 1.3) {
    warnings.push(
      warn(
        'VALID_RANGE',
        `Fitted exponent ${k.toFixed(3)} is outside the plausible 1.0-1.3 range — check ` +
          'the reference results for errors.',
      ),
    );
  }
  if (r2 < 0.9) {
    warnings.push(
      warn(
        'VALID_RANGE',
        `Fit is loose (R² ${r2.toFixed(2)}). Results from very different conditions or ` +
          'fitness levels will do that.',
      ),
    );
  }

  return ok({
    k,
    a: Math.exp(logA),
    r2,
    n: valid.length,
    prov: provenance(
      [
        {
          id: 'riegel.fit',
          version: RIEGEL.version,
          calibration: 'verified',
          params: { n: valid.length },
          source: 'recency-weighted least squares in log-log space',
        },
      ],
      computedAt,
      warnings,
    ),
  });
};
