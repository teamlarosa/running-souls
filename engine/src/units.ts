/**
 * units.ts — canonical units and boundary conversions.
 *
 * CANON: every value inside the engine is METRES and SECONDS, float64.
 * Pace is stored as SECONDS PER METRE (a true ratio, never a formatted string).
 * Conversion happens only at input and display boundaries (rule 3).
 */

// ---------------------------------------------------------------------------
// Exact constants
// ---------------------------------------------------------------------------

/** Exact by definition of the kilometre. */
export const METRES_PER_KM = 1000;
/** Exact by definition of the international mile (1959). */
export const METRES_PER_MILE = 1609.344;
export const YARDS_PER_MILE = 1760;
/** Exact: 1 international foot = 0.3048 m. */
export const FEET_PER_METRE = 1 / 0.3048;
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;

// ---------------------------------------------------------------------------
// Branded types — prevent mixing metres with seconds, or pace with speed.
// ---------------------------------------------------------------------------

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Metres = Brand<number, 'Metres'>;
export type Seconds = Brand<number, 'Seconds'>;
/** Seconds per metre. A ratio: pace = duration / distance. */
export type SecPerMetre = Brand<number, 'SecPerMetre'>;
/** Metres per second. */
export type MPS = Brand<number, 'MPS'>;
/** Fractional grade, e.g. 0.05 for +5%. Not a percentage. */
export type Grade = Brand<number, 'Grade'>;

export const asMetres = (n: number): Metres => n as Metres;
export const asSeconds = (n: number): Seconds => n as Seconds;
export const asSecPerMetre = (n: number): SecPerMetre => n as SecPerMetre;
export const asMPS = (n: number): MPS => n as MPS;
export const asGrade = (n: number): Grade => n as Grade;

// ---------------------------------------------------------------------------
// Distance conversions
// ---------------------------------------------------------------------------

export const metresToKm = (m: number): number => m / METRES_PER_KM;
export const kmToMetres = (km: number): Metres => asMetres(km * METRES_PER_KM);
export const metresToMiles = (m: number): number => m / METRES_PER_MILE;
export const milesToMetres = (mi: number): Metres => asMetres(mi * METRES_PER_MILE);
export const metresToFeet = (m: number): number => m * FEET_PER_METRE;
export const feetToMetres = (ft: number): number => ft / FEET_PER_METRE;

// ---------------------------------------------------------------------------
// Pace <-> canonical
// ---------------------------------------------------------------------------

/** s/m -> seconds per kilometre (the min/km display unit's base). */
export const spmToSecPerKm = (spm: number): number => spm * METRES_PER_KM;
/** s/m -> seconds per mile. */
export const spmToSecPerMile = (spm: number): number => spm * METRES_PER_MILE;
export const secPerKmToSpm = (s: number): SecPerMetre => asSecPerMetre(s / METRES_PER_KM);
export const secPerMileToSpm = (s: number): SecPerMetre => asSecPerMetre(s / METRES_PER_MILE);

// ---------------------------------------------------------------------------
// Pace <-> speed. These are RECIPROCALS, not linear conversions.
// ---------------------------------------------------------------------------

export const spmToMPS = (spm: number): MPS => asMPS(1 / spm);
export const mpsToSpm = (mps: number): SecPerMetre => asSecPerMetre(1 / mps);
/** s/m -> km/h. */
export const spmToKmh = (spm: number): number => SECONDS_PER_HOUR / (spm * METRES_PER_KM);
/** s/m -> mph. */
export const spmToMph = (spm: number): number => SECONDS_PER_HOUR / (spm * METRES_PER_MILE);

// ---------------------------------------------------------------------------
// Unit system preference. Miles is the default (decision 5).
// ---------------------------------------------------------------------------

export type UnitSystem = 'imperial' | 'metric';
export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'imperial';

export interface UnitLabels {
  readonly label: string;        // "mi" | "km"
  readonly distanceLong: string; // "miles" | "kilometres"
  readonly metresPer: number;    // 1609.344 | 1000
}

export const UNIT_LABELS: Readonly<Record<UnitSystem, UnitLabels>> = {
  imperial: { label: 'mi', distanceLong: 'miles', metresPer: METRES_PER_MILE },
  metric: { label: 'km', distanceLong: 'kilometres', metresPer: METRES_PER_KM },
};

/** Distance in the user's display unit. */
export const toDisplayDistance = (m: number, sys: UnitSystem): number =>
  m / UNIT_LABELS[sys].metresPer;

/** Pace as seconds-per-display-unit. */
export const toDisplayPace = (spm: number, sys: UnitSystem): number =>
  spm * UNIT_LABELS[sys].metresPer;
