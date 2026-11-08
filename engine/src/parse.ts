/**
 * parse.ts — input grammar. Highest-frequency source of user-visible bugs in
 * calculators, so it gets its own module and its own tests.
 *
 * Rules:
 *  - Two-field time is mm:ss, NEVER hh:mm.
 *  - Three-field time: middle and last must be < 60.
 *  - Both '.' and ',' accepted as decimal separators.
 *  - Never silently coerce: return a ParseError with a character offset.
 */

import { err, ok, type Result } from './errors.js';
import { METRES_PER_KM, METRES_PER_MILE, type Metres } from './units.js';

const decimal = (s: string | undefined): number =>
  s === undefined ? NaN : Number(s.replace(',', '.'));

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/**
 * Parse a duration. Returns SECONDS.
 * Accepts: "3:00:00", "1:39:17", "19:58.4", "180 min", "3h", "2h45",
 *          "1h 30m", "45 min", "45s"
 */
export const parseDuration = (raw: string): Result<number> => {
  const input = raw.trim().toLowerCase();
  if (!input) return err('PARSE_EMPTY', 'Enter a time.');

  // Colon form: 1, 2 or 3 fields.
  if (input.includes(':')) {
    const parts = input.split(':');
    if (parts.length > 3) {
      return err('PARSE_TIME_FORMAT', 'Use h:mm:ss or m:ss.', { offset: 0 });
    }
    if (parts.some((p) => p.trim() === '')) {
      return err('PARSE_TIME_FORMAT', 'Each field needs a number.', { offset: 0 });
    }

    const nums = parts.map(decimal);
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
      return err('PARSE_NUMBER_FORMAT', 'Times must be numbers.', { offset: 0 });
    }

    if (nums.length === 2) {
      const m = nums[0] ?? 0;
      const s = nums[1] ?? 0;
      if (s >= 60) {
        return err('PARSE_TIME_RANGE', 'Seconds must be under 60.', {
          offset: input.lastIndexOf(':') + 1,
        });
      }
      return ok(m * 60 + s);
    }

    const h = nums[0] ?? 0;
    const m = nums[1] ?? 0;
    const s = nums[2] ?? 0;
    if (m >= 60) {
      return err('PARSE_TIME_RANGE', 'Minutes must be under 60.', {
        offset: input.indexOf(':') + 1,
      });
    }
    if (s >= 60) {
      return err('PARSE_TIME_RANGE', 'Seconds must be under 60.', {
        offset: input.lastIndexOf(':') + 1,
      });
    }
    return ok(h * 3600 + m * 60 + s);
  }

  // Unit-word form. Normalise separators.
  const cleaned = input.replace(/,/g, '.').replace(/\s+/g, ' ').trim();

  // "1h 30m 15s"
  const hms = cleaned.match(
    /^(\d+(?:\.\d+)?)\s*h\s*(\d+(?:\.\d+)?)\s*m\s*(\d+(?:\.\d+)?)\s*s?$/,
  );
  if (hms) {
    return ok(
      (decimal(hms[1]) * 3600) + (decimal(hms[2]) * 60) + decimal(hms[3]),
    );
  }

  // "3h", "3 h", "2h45", "2h 45m"
  const hm = cleaned.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+(?:\.\d+)?)\s*m?)?$/);
  if (hm) {
    const h = decimal(hm[1]);
    const m = hm[2] === undefined ? 0 : decimal(hm[2]);
    if (m >= 60) return err('PARSE_TIME_RANGE', 'Minutes must be under 60.', { offset: 0 });
    return ok(h * 3600 + m * 60);
  }

  // "180 min"
  const mins = cleaned.match(/^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m)$/);
  if (mins) return ok(decimal(mins[1]) * 60);

  // "45s"
  const secs = cleaned.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)$/);
  if (secs) return ok(decimal(secs[1]));

  // Bare number. Ambiguous: we refuse to guess between minutes and seconds.
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return err('PARSE_AMBIGUOUS_NUMBER', 'Add units — for example "45 min" or "45s".', {
      offset: 0,
    });
  }

  return err('PARSE_TIME_FORMAT', 'Could not read that time.', { offset: 0 });
};

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

/** Parse a distance. Returns METRES. */
export const parseDistance = (raw: string): Result<Metres> => {
  const input = raw.trim().toLowerCase().replace(/,/g, '.');
  if (!input) return err('PARSE_EMPTY', 'Enter a distance.');

  // Range form: "37-40 km" is not a distance; reject explicitly.
  if (/\d\s*[-–]\s*\d/.test(input)) {
    return err('PARSE_NUMBER_FORMAT', 'Enter a single distance, not a range.', { offset: 0 });
  }

  const m = input.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (!m) return err('PARSE_NUMBER_FORMAT', 'Could not read that distance.', { offset: 0 });

  const numericPart = m[1] ?? '';
  const unit = m[2] ?? '';
  const value = Number(numericPart);

  if (!Number.isFinite(value) || value <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Distance must be greater than zero.', {
      field: 'distance',
    });
  }

  switch (unit) {
    case 'k':
    case 'km':
    case 'kms':
    case 'kilometre':
    case 'kilometres':
    case 'kilometer':
    case 'kilometers':
      return ok((value * METRES_PER_KM) as Metres);
    case 'm':
    case 'metre':
    case 'metres':
    case 'meter':
    case 'meters':
      return ok(value as Metres);
    case 'mi':
    case 'mile':
    case 'miles':
      return ok((value * METRES_PER_MILE) as Metres);
    case 'y':
    case 'yd':
    case 'yds':
    case 'yard':
    case 'yards':
      return ok((value * 0.9144) as Metres);
    case '':
      return err(
        'PARSE_AMBIGUOUS_NUMBER',
        'Add units — for example "26.2 mi" or "42.195 km".',
        { offset: 0 },
      );
    default:
      return err('PARSE_UNKNOWN_UNIT', `"${unit}" is not a distance unit.`, {
        offset: numericPart.length,
      });
  }
};

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

/**
 * Parse a pace. Returns SECONDS PER METRE.
 * Accepts "6:52/mi", "4:16/km", "4:16 mi", "4:16" (uses fallbackUnit).
 */
export const parsePace = (
  raw: string,
  fallbackUnit: 'mi' | 'km' = 'mi',
): Result<number> => {
  const input = raw.trim().toLowerCase();
  if (!input) return err('PARSE_EMPTY', 'Enter a pace.');

  const m = input.match(/^(.+?)\s*(?:\/\s*)?(mi|mile|miles|km|k)?$/);
  if (!m) return err('PARSE_TIME_FORMAT', 'Could not read that pace.', { offset: 0 });

  const timePart = m[1] ?? '';
  const unitPart = m[2];

  const time = parseDuration(timePart);
  if (!time.ok) return time;

  const unit = unitPart ?? fallbackUnit;
  const metresPer = unit === 'km' || unit === 'k' ? METRES_PER_KM : METRES_PER_MILE;
  return ok(time.value / metresPer);
};

// ---------------------------------------------------------------------------
// Convenience: distance with a unit hint for UI forms
// ---------------------------------------------------------------------------

export interface ParsedDistanceInput {
  readonly metres: Metres;
  /** Unit the user actually typed, if any — lets the UI not fight the user. */
  readonly detectedUnit?: 'mi' | 'km';
}

export const parseDistanceWithHint = (raw: string): Result<ParsedDistanceInput> => {
  const unitMatch = raw.trim().toLowerCase().match(/(mi|mile|miles|km|k)\s*$/);
  const detectedUnit = unitMatch?.[1]?.startsWith('mi') ? ('mi' as const) : unitMatch ? ('km' as const) : undefined;

  const parsed = parseDistance(raw);
  if (!parsed.ok) return parsed;
  return ok({ metres: parsed.value, detectedUnit });
};
