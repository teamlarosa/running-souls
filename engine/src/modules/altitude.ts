/**
 * modules/altitude.ts — altitude performance adjustment.
 *
 * Wehrlin, J.P. & Hallen, J. (2006). Eur J Appl Physiol 98, 437-445.
 * VO2max declines ~6.3% per 1000 m above the threshold, linearly, even in
 * trained endurance athletes. The paper found declines beginning as low as
 * 300-800 m, and PERFORMANCE declines more steeply than VO2max.
 *
 * Two things most calculators miss, both implemented here:
 *   1. Duration dependence — sprints barely affected, effects clear from 800 m up.
 *   2. Arrival timing — racing 24 h after arriving is worse than not travelling.
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { ALTITUDE, CALIBRATION, SOURCES } from '../models/config.js';
import { asSecPerMetre, type SecPerMetre } from '../units.js';

const altModel = (params: Record<string, number | string> = {}) => ({
  id: 'altitude.wehrlin',
  version: ALTITUDE.version,
  calibration: CALIBRATION.altitude,
  params,
  source: `altitude: ${SOURCES.altitude.citation}`,
});

/**
 * Duration factor in [0, ~1.2]. Short efforts are barely affected; long
 * efforts pay close to the full price.
 */
const durationFactor = (durationS: number): number => {
  const { minMinutes, saturateMinutes } = ALTITUDE.durationSat;
  const minutes = durationS / 60;
  if (minutes <= minMinutes) return 0.1;
  if (minutes >= saturateMinutes) return 1;
  return 0.1 + 0.9 * ((minutes - minMinutes) / (saturateMinutes - minMinutes));
};

export interface AltitudeInput {
  readonly paceSpm: SecPerMetre;
  readonly durationS: number;
  /** Race elevation, metres. */
  readonly elevationM: number;
  /** Altitude the athlete is adapted to, metres. Usually home elevation. */
  readonly adaptedElevationM?: number;
  readonly computedAt: string;
}

export interface AltitudeResult {
  readonly adjustedSpm: number;
  readonly multiplier: number;
  /** Fractional VO2max decline at this elevation. */
  readonly vo2DeclineFraction: number;
  readonly prov: Provenance;
}

export const adjustForAltitude = (input: AltitudeInput): Result<AltitudeResult> => {
  const { paceSpm, durationS, elevationM, computedAt } = input;
  const adapted = input.adaptedElevationM ?? 0;

  if (!Number.isFinite(paceSpm) || paceSpm <= 0) {
    return err('PACE_NOT_POSITIVE', 'Pace must be greater than zero.', { field: 'pace' });
  }
  if (!Number.isFinite(elevationM)) {
    return err('OUT_OF_VALID_RANGE', 'Elevation is required.');
  }

  const effectiveElevation = Math.max(elevationM, adapted);
  const aboveThreshold = Math.max(0, effectiveElevation - ALTITUDE.thresholdM);

  const vo2DeclineFraction = aboveThreshold * ALTITUDE.declinePerMetre;
  const perfDecline = vo2DeclineFraction * ALTITUDE.performanceAmplification;
  const factor = durationFactor(durationS);

  const multiplier = Math.max(ALTITUDE.minMultiplier, 1 + perfDecline * factor);

  const warnings: Warning[] = [];
  if (elevationM > 3000) {
    warnings.push(
      warn(
        'VALID_RANGE',
        'Above 3000 m the relationship stops being linear and individual variation ' +
          'is large.',
      ),
    );
  }
  if (elevationM < 800) {
    warnings.push(warn('VALID_RANGE', 'Below 800 m the adjustment is negligible.'));
  }

  return ok({
    adjustedSpm: paceSpm * multiplier,
    multiplier,
    vo2DeclineFraction,
    prov: provenance(
      [altModel({ elevationM, adaptedElevationM: adapted })],
      computedAt,
      warnings,
    ),
  });
};

/** Inverse: convert an altitude performance to its sea-level equivalent. */
export const toSeaLevelEquivalent = (
  altitudeTimeS: number,
  elevationM: number,
  computedAt: string,
): Result<{ seconds: number; prov: Provenance }> => {
  const aboveThreshold = Math.max(0, elevationM - ALTITUDE.thresholdM);
  const perfDecline = aboveThreshold * ALTITUDE.declinePerMetre * ALTITUDE.performanceAmplification;
  const seconds = altitudeTimeS / Math.max(ALTITUDE.minMultiplier, 1 + perfDecline);
  return ok({
    seconds,
    prov: provenance([altModel({ elevationM, direction: 'to_sea_level' })], computedAt),
  });
};

// ---------------------------------------------------------------------------
// Arrival timing (spec §7.4, point 2). Almost nobody models this.
// ---------------------------------------------------------------------------

export type ArrivalTiming = 'same_day' | 'one_day' | 'two_to_three_days' | 'one_week' | 'two_plus_weeks';

export interface ArrivalAdvice {
  readonly timing: ArrivalTiming;
  /** Multiplier ON TOP of the altitude adjustment (>1 means worse). */
  readonly extraMultiplier: number;
  readonly note: string;
}

/**
 * Arrival-timing adjustment.
 *
 * The counter-intuitive finding: arriving 24 h before a race is WORSE than not
 * travelling at all, because acute diuresis and disrupted sleep land on race
 * morning. Acceptable windows are <24 h (before acclimatisation begins) or
 * 2-3 weeks (partial adaptation).
 */
export const arrivalAdjustment = (timing: ArrivalTiming): ArrivalAdvice => {
  switch (timing) {
    case 'same_day':
      return {
        timing,
        extraMultiplier: 1.0,
        note: 'Arriving the morning of the race avoids the 24-hour dip. Best if you can travel early.',
      };
    case 'one_day':
      return {
        timing,
        extraMultiplier: 1.02,
        note: 'Arriving the day before is often the worst option — the acute response lands on race morning.',
      };
    case 'two_to_three_days':
      return {
        timing,
        extraMultiplier: 1.01,
        note: 'Still early in acclimatisation. Sleep and hydration are the priorities.',
      };
    case 'one_week':
      return {
        timing,
        extraMultiplier: 1.0,
        note: 'Partial adaptation. Most athletes feel reasonable by now.',
      };
    case 'two_plus_weeks':
      return {
        timing,
        extraMultiplier: 0.97,
        note: 'Partial acclimatisation gives a small benefit over arriving fresh.',
      };
  }
};
