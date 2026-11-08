/**
 * pace.ts — Module PAC. Solve any single unknown from the other two.
 *
 * CANON: metres, seconds, seconds-per-metre. Float64 throughout.
 */

import { err, ok, type EngineError, type Result } from './errors.js';
import { provenance, type Provenance } from './provenance.js';
import { asSecPerMetre, type Metres, type SecPerMetre, type Seconds } from './units.js';

/**
 * Human-plausible speed window, m/s.
 * Upper: ~2:13/km — faster than any human over any distance.
 * Lower: 0.5 m/s ≈ 33:20/km — slower than a walk; catches unit mistakes.
 */
export const MIN_MPS = 0.5;
export const MAX_MPS = 12;

export interface PaceQuery {
  readonly distance?: Metres;
  readonly duration?: Seconds;
  readonly pace?: SecPerMetre;
}

export interface PaceResult {
  readonly distance: Metres;
  readonly duration: Seconds;
  readonly pace: SecPerMetre;
  /** Metres per second. */
  readonly speed: number;
  readonly prov: Provenance;
}

const MODEL_PACE = {
  id: 'pace.core',
  version: '1.0.0',
  calibration: 'verified' as const,
  params: {},
  source: 'definition: pace = duration / distance',
};

const positive = (
  v: number | undefined,
  field: 'distance' | 'duration' | 'pace',
): EngineError | null => {
  if (v === undefined) return null;
  if (Number.isFinite(v) && v > 0) return null;
  const code =
    field === 'distance'
      ? 'DISTANCE_NOT_POSITIVE'
      : field === 'duration'
        ? 'DURATION_NOT_POSITIVE'
        : 'PACE_NOT_POSITIVE';
  return err(code, `That ${field} must be greater than zero.`, { field });
};

const validateSpeed = (mps: number): EngineError | null => {
  if (!Number.isFinite(mps) || mps <= 0) {
    return err('SPEED_OUT_OF_RANGE', 'That combination is not a real speed.', { field: 'pace' });
  }
  if (mps < MIN_MPS) {
    return err(
      'SPEED_OUT_OF_RANGE',
      'That is slower than walking pace — check your units.',
      { field: 'pace' },
    );
  }
  if (mps > MAX_MPS) {
    return err(
      'SPEED_OUT_OF_RANGE',
      'That is faster than any human has run — check your units.',
      { field: 'pace' },
    );
  }
  return null;
};

/**
 * Solve a pace, given any two of {distance, duration, pace}.
 *
 * @param computedAt ISO timestamp supplied by the caller. The engine never
 *                   reads the clock (rule 4).
 */
export const solvePace = (query: PaceQuery, computedAt: string): Result<PaceResult> => {
  const { distance, duration, pace } = query;
  const supplied = [distance, duration, pace].filter((x) => x !== undefined).length;

  if (supplied < 2) {
    return err('INSUFFICIENT_INPUT', 'Give two of: distance, time, pace.');
  }
  if (supplied > 2) {
    return err('AMBIGUOUS_INPUT', 'Give exactly two of: distance, time, pace.');
  }

  for (const [value, field] of [
    [distance, 'distance'],
    [duration, 'duration'],
    [pace, 'pace'],
  ] as const) {
    const bad = positive(value, field);
    if (bad) return bad;
  }

  let metres: number;
  let seconds: number;

  if (distance !== undefined && duration !== undefined) {
    metres = distance;
    seconds = duration;
  } else if (distance !== undefined && pace !== undefined) {
    metres = distance;
    seconds = pace * distance;
  } else if (duration !== undefined && pace !== undefined) {
    seconds = duration;
    if (pace === 0) return err('PACE_NOT_POSITIVE', 'Pace must be greater than zero.', { field: 'pace' });
    metres = duration / pace;
  } else {
    return err('INSUFFICIENT_INPUT', 'Give two of: distance, time, pace.');
  }

  const speed = metres / seconds;
  const bad = validateSpeed(speed);
  if (bad) return bad;

  return ok({
    distance: metres as Metres,
    duration: seconds as Seconds,
    pace: asSecPerMetre(seconds / metres),
    speed,
    prov: provenance([MODEL_PACE], computedAt),
  });
};

// ---------------------------------------------------------------------------
// Aggregation. Exposed explicitly so callers cannot get it wrong.
// ---------------------------------------------------------------------------

export interface SegmentLike {
  readonly distanceM: number;
  readonly durationS: number;
}

/**
 * Aggregate pace = total seconds / total metres.
 * NEVER the arithmetic mean of segment paces: pace is a reciprocal, so the
 * correct "average" of paces is the harmonic mean of speeds.
 */
export const aggregate = (
  segments: readonly SegmentLike[],
  computedAt: string,
): Result<PaceResult> => {
  if (segments.length === 0) {
    return err('INSUFFICIENT_INPUT', 'No segments to aggregate.');
  }

  let totalM = 0;
  let totalS = 0;

  for (const s of segments) {
    if (!Number.isFinite(s.distanceM) || s.distanceM <= 0) {
      return err('DISTANCE_NOT_POSITIVE', 'Every segment needs a positive distance.', {
        field: 'distance',
      });
    }
    if (!Number.isFinite(s.durationS) || s.durationS <= 0) {
      return err('DURATION_NOT_POSITIVE', 'Every segment needs a positive time.', {
        field: 'duration',
      });
    }
    totalM += s.distanceM;
    totalS += s.durationS;
  }

  return solvePace(
    { distance: totalM as Metres, duration: totalS as Seconds },
    computedAt,
  );
};

/** Harmonic mean of speeds — the mathematically correct "average pace". */
export const harmonicMeanSpeed = (speeds: readonly number[]): number => {
  if (speeds.length === 0) return 0;
  const invSum = speeds.reduce((acc, v) => acc + (v > 0 ? 1 / v : 0), 0);
  return invSum === 0 ? 0 : speeds.length / invSum;
};

/** Pace needed to hit a target time. Thin wrapper that documents intent. */
export const paceForGoal = (
  distanceM: Metres,
  targetSeconds: Seconds,
  computedAt: string,
): Result<PaceResult> => solvePace({ distance: distanceM, duration: targetSeconds }, computedAt);

export const speedToSpm = (mps: number): SecPerMetre => asSecPerMetre(1 / mps);
export const spmToSpeed = (spm: SecPerMetre): number => 1 / spm;
