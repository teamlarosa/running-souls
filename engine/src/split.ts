/**
 * split.ts — Module SPLIT. Splits and pace bands.
 *
 * The critical property: cumulative rounding, then differencing. This
 * guarantees sum(splits) === total EXACTLY, in whole seconds.
 */

import { err, ok, type Result } from './errors.js';
import { roundHalfAway } from './format.js';
import { provenance, type Provenance, warn, type Warning } from './provenance.js';
import { METRES_PER_KM, METRES_PER_MILE, type Metres, type Seconds } from './units.js';

const MODEL_SPLIT = {
  id: 'split.cumulative',
  version: '1.0.0',
  calibration: 'verified' as const,
  params: {},
  source: 'definition',
};

export type SplitUnit = 'km' | 'mi';

export interface Split {
  readonly index: number;
  readonly label: string;
  readonly startM: number;
  readonly endM: number;
  readonly distanceM: number;
  readonly splitSeconds: number;
  readonly cumulativeSeconds: number;
  readonly paceSpm: number;
}

export interface SplitTable {
  readonly splits: readonly Split[];
  readonly intervalM: number;
  readonly totalDistanceM: number;
  readonly totalSeconds: number;
  readonly aggregatePaceSpm: number;
  readonly prov: Provenance;
}

const unitMetres = (u: SplitUnit): number =>
  u === 'km' ? METRES_PER_KM : METRES_PER_MILE;

/**
 * Even-pace splits.
 *
 *   cum_k   = round(T * d_k / D)
 *   split_k = cum_k - cum_{k-1}
 *
 * Naive per-split rounding drifts by up to 0.5 s * n.
 */
export const evenSplits = (
  distanceM: Metres,
  totalSeconds: Seconds,
  opts: { unit?: SplitUnit; intervalM?: number; computedAt: string },
): Result<SplitTable> => {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return err('DURATION_NOT_POSITIVE', 'Time must be greater than zero.', {
      field: 'duration',
    });
  }

  const unit = opts.unit ?? 'mi';
  const interval = opts.intervalM ?? unitMetres(unit);
  if (!Number.isFinite(interval) || interval <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Split interval must be greater than zero.');
  }

  const n = Math.max(1, Math.ceil(distanceM / interval - 1e-9));
  const warnings: Warning[] = [];

  if (n > 500) {
    warnings.push(warn('VALID_RANGE', 'That split interval produces a very long table.'));
  }

  const totalRounded = roundHalfAway(totalSeconds);
  const splits: Split[] = [];
  let prevCum = 0;

  for (let k = 1; k <= n; k += 1) {
    const endM = Math.min(k * interval, distanceM);
    const startM = (k - 1) * interval;
    const segM = endM - startM;

    // Cumulative rounding, then difference. Final row takes the exact total.
    const cum =
      k === n
        ? totalRounded
        : roundHalfAway((totalSeconds * endM) / distanceM);
    const splitSeconds = cum - prevCum;

    splits.push({
      index: k,
      label: labelFor(k, unit, interval),
      startM,
      endM,
      distanceM: segM,
      splitSeconds,
      cumulativeSeconds: cum,
      paceSpm: splitSeconds / segM,
    });

    prevCum = cum;
  }

  // Assert the invariant rather than trusting it.
  const sum = splits.reduce((acc, s) => acc + s.splitSeconds, 0);
  if (sum !== totalRounded) {
    return err(
      'OUT_OF_VALID_RANGE',
      `Internal split invariant failed (sum ${sum} vs total ${totalRounded}).`,
    );
  }

  return ok({
    splits,
    intervalM: interval,
    totalDistanceM: distanceM,
    totalSeconds,
    aggregatePaceSpm: totalSeconds / distanceM,
    prov: provenance([MODEL_SPLIT], opts.computedAt, warnings),
  });
};

const labelFor = (k: number, unit: SplitUnit, interval: number): string => {
  if (interval === unitMetres(unit)) return String(k);
  const coveredM = k * interval;
  const inUnits = coveredM / unitMetres(unit);
  return Number.isInteger(inUnits) ? String(inUnits) : inUnits.toFixed(1);
};

// ---------------------------------------------------------------------------
// Pace bands
// ---------------------------------------------------------------------------

export type BandStrategy = 'even' | 'negative_split';

export interface BandOptions {
  readonly strategy?: BandStrategy;
  /** Second-half time as a fraction of the first half. 0.99 ≈ 2% negative split. */
  readonly secondHalfFactor?: number;
  readonly computedAt: string;
}

export interface PaceBand {
  readonly strategy: BandStrategy;
  readonly firstHalfSeconds: number;
  readonly secondHalfSeconds: number;
  readonly firstHalfPaceSpm: number;
  readonly secondHalfPaceSpm: number;
  readonly totalSeconds: number;
  readonly prov: Provenance;
}

/**
 * Build a two-half pace band.
 *
 * `negative_split` is an explicit parameter, not a magic number, and the
 * resulting halves are returned so the user can sanity-check them.
 */
export const paceBand = (
  distanceM: Metres,
  totalSeconds: Seconds,
  opts: BandOptions,
): Result<PaceBand> => {
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return err('DURATION_NOT_POSITIVE', 'Time must be greater than zero.', {
      field: 'duration',
    });
  }

  const strategy = opts.strategy ?? 'even';
  const factor = opts.secondHalfFactor ?? 0.99;

  if (strategy === 'negative_split' && !(factor > 0.9 && factor < 1.1)) {
    return err('OUT_OF_VALID_RANGE', 'Second-half factor must be near 1.0 (0.9-1.1).');
  }

  const halfM = distanceM / 2;
  let first: number;
  let second: number;

  if (strategy === 'even') {
    first = totalSeconds / 2;
    second = totalSeconds / 2;
  } else {
    first = totalSeconds / (1 + factor);
    second = totalSeconds - first;
  }

  const warnings: Warning[] = [];
  if (strategy === 'negative_split') {
    warnings.push(
      warn(
        'VALID_RANGE',
        'Negative splits assume controlled early pacing. Most blow-ups come from going ' +
          'out too fast.',
      ),
    );
  }

  return ok({
    strategy,
    firstHalfSeconds: first,
    secondHalfSeconds: second,
    firstHalfPaceSpm: first / halfM,
    secondHalfPaceSpm: second / halfM,
    totalSeconds,
    prov: provenance([MODEL_SPLIT], opts.computedAt, warnings),
  });
};

// ---------------------------------------------------------------------------
// Even-effort splits for hilly courses. Integration point for grade.ts.
// ---------------------------------------------------------------------------

export interface EffortSplitInput {
  readonly distanceM: number;
  /** Energy-cost ratio per segment (actual cost / flat cost). */
  readonly costRatio: number;
}

export interface EffortSplit {
  readonly distanceM: number;
  readonly seconds: number;
  readonly spm: number;
}

export const evenEffortSplits = (
  segments: readonly EffortSplitInput[],
  targetGapSpm: number,
  computedAt: string,
): Result<{ segments: readonly EffortSplit[]; totalSeconds: number; prov: Provenance }> => {
  if (segments.length === 0) return err('INSUFFICIENT_INPUT', 'No segments supplied.');
  if (!Number.isFinite(targetGapSpm) || targetGapSpm <= 0) {
    return err('PACE_NOT_POSITIVE', 'Target GAP pace must be positive.', { field: 'pace' });
  }

  const out: EffortSplit[] = [];
  let total = 0;

  for (const seg of segments) {
    if (!Number.isFinite(seg.distanceM) || seg.distanceM <= 0) {
      return err('DISTANCE_NOT_POSITIVE', 'Every segment needs a positive distance.');
    }
    if (!Number.isFinite(seg.costRatio) || seg.costRatio <= 0) {
      return err('OUT_OF_VALID_RANGE', 'Cost ratio must be positive.');
    }
    // Actual pace = GAP pace * cost ratio (uphill costs more time per metre).
    const actualSpm = targetGapSpm * seg.costRatio;
    const seconds = actualSpm * seg.distanceM;
    out.push({ distanceM: seg.distanceM, seconds, spm: actualSpm });
    total += seconds;
  }

  return ok({
    segments: out,
    totalSeconds: total,
    prov: provenance([MODEL_SPLIT], computedAt),
  });
};
