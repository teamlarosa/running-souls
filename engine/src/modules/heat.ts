/**
 * modules/heat.ts — heat/humidity pace adjustment.
 *
 * IMPORTANT HONESTY REQUIREMENT
 * There is no single peer-reviewed "heat pace formula". Published tools use
 * coach-derived heuristics, and SOURCES DISAGREE on the threshold (100F vs
 * 130F for the temperature + dew point sum). So this module:
 *   - is labelled heuristic in provenance,
 *   - parameterises both schools (decision 4: default 130, alternative exposed),
 *   - must never be presented to users as a prediction.
 *
 * Why the sum and not relative humidity: dew point directly determines whether
 * sweat can evaporate. RH swings with air temperature and misleads.
 *
 * Duration dependence: a 5K in heat costs far less than a marathon in the same
 * heat, so the penalty is scaled by duration.
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { CALIBRATION, HEAT, SOURCES } from '../models/config.js';
import type { SecPerMetre } from '../units.js';

export type HeatModelId = keyof typeof HEAT.models;

const heatModel = (
  id: HeatModelId,
  params: Record<string, number | string | boolean> = {},
) => ({
  id: 'heat.sum_f',
  version: HEAT.version,
  calibration: CALIBRATION.heat,
  params: { ...HEAT.models[id], model: id, ...params },
  source: `heat: ${SOURCES.heat.note}`,
});

export interface HeatInput {
  readonly paceSpm: SecPerMetre;
  /** Race duration at the NEUTRAL pace, seconds. Drives duration scaling. */
  readonly durationS: number;
  readonly tempF: number;
  readonly dewPointF: number;
  readonly model?: HeatModelId;
  /** 0 = not acclimated, 1 = fully acclimated (10-14 days). */
  readonly acclimation?: number;
  readonly computedAt: string;
}

export interface HeatResult {
  /** Suggested pace to hold the same effort, s/m. */
  readonly adjustedSpm: number;
  readonly multiplier: number;
  readonly rawPenalty: number;
  readonly scaledPenalty: number;
  /** Temperature + dew point, Fahrenheit. */
  readonly sumF: number;
  readonly prov: Provenance;
}

/**
 * Duration scaling factor in [0, 1]: how much of the raw penalty applies.
 * Short efforts are barely affected; long ones pay nearly in full.
 */
const durationFactor = (durationS: number): number => {
  const { minMinutes, saturateMinutes } = HEAT.durationSat;
  const minutes = durationS / 60;
  if (minutes <= minMinutes) return 0.25;
  if (minutes >= saturateMinutes) return 1;
  return 0.25 + 0.75 * ((minutes - minMinutes) / (saturateMinutes - minMinutes));
};

export const adjustForHeat = (input: HeatInput): Result<HeatResult> => {
  const { paceSpm, durationS, tempF, dewPointF, computedAt } = input;
  const modelId = input.model ?? HEAT.defaultModel;

  if (!Number.isFinite(paceSpm) || paceSpm <= 0) {
    return err('PACE_NOT_POSITIVE', 'Pace must be greater than zero.', { field: 'pace' });
  }
  if (!Number.isFinite(tempF) || !Number.isFinite(dewPointF)) {
    return err('OUT_OF_VALID_RANGE', 'Temperature and dew point are required.');
  }
  if (dewPointF > tempF) {
    return err(
      'OUT_OF_VALID_RANGE',
      'Dew point cannot exceed air temperature — check the values.',
    );
  }

  const config = HEAT.models[modelId];
  const sumF = tempF + dewPointF;

  const points = (sumF - config.thresholdF) / 10;
  const rawPenalty = points > 0 ? (config.percentPer10Points / 100) * points : 0;

  const scaledByDuration = rawPenalty * durationFactor(durationS);

  // Acclimation reduces the penalty — modelled as a reduction, not a switch.
  const a = Math.max(0, Math.min(1, input.acclimation ?? 0));
  const scaledPenalty = scaledByDuration * (1 - a * HEAT.maxAcclimationBenefit);

  const warnings: Warning[] = [
    warn(
      'HEURISTIC_MODEL',
      'Heat adjustment is coach-derived guidance, not a physiological prediction. ' +
        'Individual responses vary widely.',
    ),
  ];

  if (sumF >= HEAT.dangerSumF) {
    warnings.push(
      warn(
        'VALID_RANGE',
        'Conditions this severe make racing genuinely inadvisable. Consider not racing.',
      ),
    );
  }
  if (a > 0 && a < 1) {
    warnings.push(
      warn('ACCLIMATION_ASSUMED', 'Partial acclimation assumed from your reported exposure.'),
    );
  }

  return ok({
    adjustedSpm: paceSpm * (1 + scaledPenalty),
    multiplier: 1 + scaledPenalty,
    rawPenalty,
    scaledPenalty,
    sumF,
    prov: provenance([heatModel(modelId, { acclimation: a })], computedAt, warnings),
  });
};

/** Dew point from temperature and relative humidity, in Fahrenheit. Magnus formula. */
export const dewPointF = (tempF: number, relativeHumidity: number): number => {
  const tC = ((tempF - 32) * 5) / 9;
  const rh = Math.max(0.01, Math.min(1, relativeHumidity));
  const alpha = Math.log(rh) + (17.625 * tC) / (243.04 + tC);
  const dewC = (243.04 * alpha) / (17.625 - alpha);
  return (dewC * 9) / 5 + 32;
};

// ---------------------------------------------------------------------------
// Composition with other modifiers
// ---------------------------------------------------------------------------

export interface MixedAdjustment {
  readonly heatMultiplier: number;
  readonly altitudeMultiplier: number;
  readonly gradeMultiplier: number;
  readonly combined: number;
  readonly prov: Provenance;
}

/**
 * Multiplicative stacking is an APPROXIMATION: modifiers are not truly
 * independent (heat and altitude both stress oxygen delivery, so their combined
 * effect is less than the product). When the stack grows large we warn rather
 * than pretend precision.
 */
export const combineModifiers = (
  parts: { heat?: number; altitude?: number; grade?: number },
  computedAt: string,
): MixedAdjustment => {
  const heatMultiplier = parts.heat ?? 1;
  const altitudeMultiplier = parts.altitude ?? 1;
  const gradeMultiplier = parts.grade ?? 1;
  const combined = heatMultiplier * altitudeMultiplier * gradeMultiplier;

  const warnings: Warning[] = [];
  if (combined - 1 > HEAT.combinedWarnThreshold) {
    warnings.push(
      warn(
        'COMBINED_UNCERTAINTY_HIGH',
        'Conditions compound, and these adjustments are not truly independent. Treat ' +
          'the combined figure as a rough guide with a wide range.',
      ),
    );
  }

  return {
    heatMultiplier,
    altitudeMultiplier,
    gradeMultiplier,
    combined,
    prov: provenance([heatModel(HEAT.defaultModel, { combined })], computedAt, warnings),
  };
};
