/**
 * format.ts — display helpers, entirely app-side.
 *
 * These wrap the engine's pure formatters with the unit-aware presentation the
 * UI needs. No arithmetic that belongs in the engine happens here.
 */

import {
  METRES_PER_KM,
  METRES_PER_MILE,
  type UnitSystem,
} from '@running/engine';

export const unitLabel = (sys: UnitSystem): string => (sys === 'imperial' ? 'mi' : 'km');
export const unitLong = (sys: UnitSystem): string =>
  sys === 'imperial' ? 'miles' : 'kilometres';
export const metresPerUnit = (sys: UnitSystem): number =>
  sys === 'imperial' ? METRES_PER_MILE : METRES_PER_KM;

/** s/m -> seconds per display unit. */
export const paceToDisplay = (spm: number, sys: UnitSystem): number =>
  spm * metresPerUnit(sys);

/** seconds per display unit -> s/m. */
export const paceFromDisplay = (secPerUnit: number, sys: UnitSystem): number =>
  secPerUnit / metresPerUnit(sys);

/** seconds -> h:mm:ss or m:ss, trimming empty hours. */
export const clock = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const total = Math.round(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** seconds -> m:ss for pace values. Never shows an hours field. */
export const paceClock = (totalSeconds: number): string => {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—';
  const total = Math.round(totalSeconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** A pace range, e.g. "6:05–6:40". */
export const paceRange = (slowSpm: number, fastSpm: number, sys: UnitSystem): string =>
  `${paceClock(paceToDisplay(slowSpm, sys))}–${paceClock(paceToDisplay(fastSpm, sys))}`;

/** Metres -> display distance with sensible precision. */
export const distanceDisplay = (metres: number, sys: UnitSystem): string => {
  const value = metres / metresPerUnit(sys);
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(decimals);
};

/** Signed delta in seconds -> "+12s" / "−3:20". */
export const signedDelta = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds === 0) return '±0';
  const sign = seconds > 0 ? '+' : '−';
  const abs = Math.abs(seconds);
  return abs < 60 ? `${sign}${Math.round(abs)}s` : `${sign}${clock(abs)}`;
};

/** Percent, with sign, one decimal. */
export const signedPercent = (fraction: number, decimals = 1): string => {
  if (!Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  const rounded = Number(pct.toFixed(decimals));
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}%`;
};
