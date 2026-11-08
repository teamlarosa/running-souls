/**
 * provenance.ts — every computed value carries the evidence for itself.
 *
 * This is the product's differentiator (spec §10): results are reproducible
 * and auditable. No engine function may return a number without provenance.
 */

export const ENGINE_VERSION = '0.1.0';

/**
 * How much we trust a model's constants.
 *  - verified    : reproduces a published reference table within tolerance
 *  - provisional : sourced from primary literature, not yet validated in our harness
 *  - heuristic   : coach-derived guidance, no primary source (never present as prediction)
 */
export type Calibration = 'verified' | 'provisional' | 'heuristic';

export interface ModelRef {
  /** Stable id, e.g. "riegel", "vdot", "heat.sum_f". */
  readonly id: string;
  /** Bump when any constant or formula changes. */
  readonly version: string;
  readonly calibration: Calibration;
  /** Parameters actually used in this computation. */
  readonly params: Readonly<Record<string, number | string | boolean>>;
  /** Key into the attribution register (spec §10). */
  readonly source: string;
}

export type WarningCode =
  | 'EXTRAPOLATION'
  | 'STALE_RESULT'
  | 'COMBINED_UNCERTAINTY_HIGH'
  | 'VALID_RANGE'
  | 'PROVISIONAL_CONSTANTS'
  | 'HEURISTIC_MODEL'
  | 'ROUNDING_MISMATCH'
  | 'ACCLIMATION_ASSUMED';

export interface Warning {
  readonly code: WarningCode;
  readonly message: string;
}

export interface Provenance {
  readonly engineVersion: string;
  readonly models: readonly ModelRef[];
  /** ISO 8601, supplied by the caller — the engine never reads the clock. */
  readonly computedAt: string;
  readonly warnings: readonly Warning[];
}

export const warn = (code: WarningCode, message: string): Warning => ({ code, message });

/** Compose provenance from the models consulted. */
export const provenance = (
  models: readonly ModelRef[],
  computedAt: string,
  warnings: readonly Warning[] = [],
): Provenance => ({
  engineVersion: ENGINE_VERSION,
  models: Object.freeze([...models]),
  computedAt,
  warnings: Object.freeze([...warnings]),
});

/** True if any consulted model is not fully verified. */
export const hasProvisionalModel = (p: Provenance): boolean =>
  p.models.some((m) => m.calibration !== 'verified');

/** Warnings that should block a result from being presented as a prediction. */
export const isHeuristicOnly = (p: Provenance): boolean =>
  p.models.length > 0 && p.models.every((m) => m.calibration === 'heuristic');
