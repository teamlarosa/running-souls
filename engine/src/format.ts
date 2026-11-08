/**
 * format.ts — display formatting. All rounding happens HERE and nowhere else.
 *
 * Decision 1: round half away from zero. We accept a visible pace/time
 * mismatch (a 3:00:00 marathon at 4:16/km recomputes to 3:00:02) rather than
 * showing false precision like 4:16.1.
 */

/** Round half away from zero. Matches user intuition; banker's rounding surprises. */
export const roundHalfAway = (n: number): number =>
  n < 0 ? -Math.round(-n) : Math.round(n);

/** Round to a fixed number of decimals, half away from zero. */
export const roundTo = (n: number, decimals: number): number => {
  const f = 10 ** decimals;
  return ((n < 0 ? -1 : 1) * Math.round(Math.abs(n) * f)) / f;
};

export type DurationStyle = 'hms' | 'ms' | 'terse';

export interface FormatOptions {
  readonly tenths?: boolean;
  readonly style?: DurationStyle;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Format seconds as a clock string.
 *   10800  -> "3:00:00"
 *   5957.3 -> "1:39:17"
 *   240    -> "4:00"
 */
export const formatDuration = (seconds: number, opts: FormatOptions = {}): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const { tenths = false } = opts;

  const totalTenths = roundHalfAway(seconds * (tenths ? 10 : 1));
  const whole = tenths ? Math.floor(totalTenths / 10) : totalTenths;
  const tenthsPart = tenths ? totalTenths % 10 : 0;

  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;

  const secPart = tenths ? `${pad2(s)}.${tenthsPart}` : pad2(s);

  if (h > 0) return `${h}:${pad2(m)}:${secPart}`;
  return `${m}:${secPart}`;
};

/** Human-readable duration: "3h 00m", "1h 39m", "47m". */
export const formatDurationLong = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = roundHalfAway(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
};

/**
 * Format a pace already expressed in seconds per DISPLAY unit.
 *   formatPace(386.24256, 'mi') -> "6:26 /mi"
 */
export const formatPace = (
  secondsPerUnit: number,
  unitLabel: string,
  opts: { tenths?: boolean; withSuffix?: boolean } = {},
): string => {
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) return '—';
  const { tenths = false, withSuffix = true } = opts;
  const clock = formatDuration(secondsPerUnit, { tenths });
  return withSuffix ? `${clock} /${unitLabel}` : clock;
};

/** Format a distance in display units, trimming trailing zeros. */
export const formatDistance = (value: number, unitLabel: string, decimals = 2): string => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${roundTo(value, decimals)} ${unitLabel}`;
};

export const formatSpeed = (value: number, unit: 'km/h' | 'mph'): string =>
  Number.isFinite(value) && value > 0 ? `${roundTo(value, 1)} ${unit}` : '—';

/** Percentage with explicit sign: "+4.2%". */
export const formatPercent = (fraction: number, decimals = 1): string => {
  if (!Number.isFinite(fraction)) return '—';
  const pct = roundTo(fraction * 100, decimals);
  return `${pct > 0 ? '+' : ''}${pct}%`;
};

/** Signed time delta: "+12 s", "+3:20", "-8 s". */
export const formatDelta = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return '—';
  const sign = seconds > 0 ? '+' : seconds < 0 ? '-' : '';
  const abs = Math.abs(seconds);
  return abs < 60 ? `${sign}${roundHalfAway(abs)} s` : `${sign}${formatDuration(abs)}`;
};

/**
 * Render a confidence range: "1:39:17 ± 2:00".
 * Every prediction shows one of these — no consumer tool does, and it is free
 * credibility.
 */
export const formatRange = (centreSeconds: number, halfWidthSeconds: number): string =>
  `${formatDuration(centreSeconds)} ± ${formatDuration(halfWidthSeconds)}`;
