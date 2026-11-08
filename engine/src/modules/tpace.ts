/**
 * modules/tpace.ts — Module TPACE. Training paces as pluggable strategies.
 *
 * v1 is read-only (decision 2): this module computes and returns zone tables,
 * but the UI presents them as a preview. The shape is stable so the interactive
 * version drops in without a data-model change.
 *
 * Strategies are pluggable from day one, and the CONSENSUS view is a
 * differentiator: when three methodologies give 4:35-4:48 for easy pace and
 * one says 4:20, the disagreement is the information.
 *
 * INTERVAL CONVENTION USED THROUGHOUT THIS FILE
 *   fastSpm <= slowSpm   (a smaller s/m value is a faster pace)
 *   a zone occupies the closed interval [fastSpm, slowSpm]
 */

import { err, ok, type Result } from '../errors.js';
import { provenance, warn, type Provenance, type Warning } from '../provenance.js';
import { CALIBRATION, VDOT } from '../models/config.js';
import { asMetres, asSeconds, asSecPerMetre, type SecPerMetre } from '../units.js';
import { computeVdot } from './vdot.js';
import { csZones, fitCriticalSpeed } from './criticalspeed.js';

export type ZoneId = 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';

export const ZONE_IDS: readonly ZoneId[] = [
  'easy',
  'marathon',
  'threshold',
  'interval',
  'repetition',
];

export interface Zone {
  readonly id: ZoneId;
  readonly label: string;
  /** Slower end of the band, s/m. Larger number. */
  readonly slowSpm: SecPerMetre;
  /** Faster end of the band, s/m. Smaller number. */
  readonly fastSpm: SecPerMetre;
  readonly purpose: string;
  readonly durationCapMinutes: { readonly min: number; readonly max: number };
}

export interface ZoneTable {
  readonly zones: readonly Zone[];
  readonly strategyId: string;
  readonly prov: Provenance;
}

const zoneLabel: Record<ZoneId, string> = {
  easy: 'Easy',
  marathon: 'Marathon',
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Repetition',
};

// ---------------------------------------------------------------------------
// Oxygen-cost inverted in closed form.
//
//   a + b v + c v^2 = target   =>   c v^2 + b v + (a - target) = 0
//   v = (-b + sqrt(b^2 - 4c(a - target))) / 2c        [positive root]
//
// No iteration needed here, unlike inverting VDOT for a race time.
// ---------------------------------------------------------------------------

export const velocityForVo2 = (targetVo2: number): number => {
  const { a, b, c } = VDOT.costCoeffs;
  const disc = b * b - 4 * c * (a - targetVo2);
  if (disc < 0) return NaN;
  return (-b + Math.sqrt(disc)) / (2 * c);
};

/** VO2 target -> pace, s/m. v is m/min, so 60/v is s/m. */
const spmForVo2 = (targetVo2: number): SecPerMetre => {
  const v = velocityForVo2(targetVo2);
  return asSecPerMetre(60 / v);
};

// ---------------------------------------------------------------------------
// Strategy: Daniels VDOT
// ---------------------------------------------------------------------------

export const danielsZones = (vdot: number, computedAt: string): Result<ZoneTable> => {
  if (!Number.isFinite(vdot) || vdot <= 0) {
    return err('OUT_OF_VALID_RANGE', 'VDOT must be greater than zero.');
  }

  const zones: Zone[] = [];

  for (const id of ZONE_IDS) {
    const band = VDOT.zones[id];
    const caps = VDOT.zoneDurationCapsMinutes[id];

    // Higher % of VDOT = faster = SMALLER s/m.
    const slowSpm = spmForVo2((band.low / 100) * vdot);
    const fastSpm = spmForVo2((band.high / 100) * vdot);

    if (!Number.isFinite(slowSpm) || !Number.isFinite(fastSpm)) {
      return err('OUT_OF_VALID_RANGE', `Could not solve paces for the ${id} zone.`);
    }

    zones.push({
      id,
      label: zoneLabel[id],
      slowSpm,
      fastSpm,
      purpose: band.purpose,
      durationCapMinutes: { min: caps.min, max: caps.max },
    });
  }

  const warnings: Warning[] = [
    warn(
      'PROVISIONAL_CONSTANTS',
      'Zone bands are pending calibration against the published table. Paces are ' +
        'computed from the Daniels-Gilbert equations.',
    ),
  ];

  return ok({
    zones,
    strategyId: 'daniels_vdot',
    prov: provenance(
      [
        {
          id: 'daniels_vdot',
          version: VDOT.version,
          calibration: CALIBRATION.vdot,
          params: { vdot },
          source: 'Daniels & Gilbert oxygen-cost equations',
        },
      ],
      computedAt,
      warnings,
    ),
  });
};

/** Convenience: zones straight from a race result. */
export const danielsZonesFromRace = (
  distanceM: number,
  timeS: number,
  computedAt: string,
): Result<ZoneTable & { vdot: number }> => {
  const v = computeVdot(asMetres(distanceM), asSeconds(timeS), computedAt);
  if (!v.ok) return v;
  const zones = danielsZones(v.value.vdot, computedAt);
  if (!zones.ok) return zones;
  return ok({ ...zones.value, vdot: v.value.vdot });
};

// ---------------------------------------------------------------------------
// Strategy: critical speed
// ---------------------------------------------------------------------------

export const criticalSpeedZones = (
  shortEffort: { distanceM: number; timeS: number },
  longEffort: { distanceM: number; timeS: number },
  computedAt: string,
): Result<ZoneTable> => {
  const fit = fitCriticalSpeed(
    { distanceM: asMetres(shortEffort.distanceM), timeS: asSeconds(shortEffort.timeS) },
    { distanceM: asMetres(longEffort.distanceM), timeS: asSeconds(longEffort.timeS) },
    computedAt,
  );
  if (!fit.ok) return fit;

  const bands = csZones(fit.value.criticalSpeed);

  const zones: Zone[] = ZONE_IDS.map((id) => {
    const band = bands[id];
    const caps = VDOT.zoneDurationCapsMinutes[id];
    // Band values are SPEEDS: a larger speed is a smaller pace.
    return {
      id,
      label: zoneLabel[id],
      slowSpm: asSecPerMetre(1 / band.low),
      fastSpm: asSecPerMetre(1 / band.high),
      purpose: VDOT.zones[id].purpose,
      durationCapMinutes: { min: caps.min, max: caps.max },
    };
  });

  return ok({
    zones,
    strategyId: 'critical_speed',
    prov: provenance(
      [
        {
          id: 'critical_speed',
          version: '1.0.0',
          calibration: CALIBRATION.criticalSpeed,
          params: { cs: fit.value.criticalSpeed, dPrime: fit.value.dPrime },
          source: 'critical speed fractions',
        },
      ],
      computedAt,
    ),
  });
};

// ---------------------------------------------------------------------------
// Strategy: generic offsets from goal race pace.
// Deliberately NOT a copy of any commercial calculator's published offsets.
// ---------------------------------------------------------------------------

export const goalDeltaZones = (
  goalDistanceM: number,
  goalTimeS: number,
  computedAt: string,
): Result<ZoneTable> => {
  if (!Number.isFinite(goalDistanceM) || goalDistanceM <= 0) {
    return err('DISTANCE_NOT_POSITIVE', 'Goal distance must be greater than zero.', {
      field: 'distance',
    });
  }
  if (!Number.isFinite(goalTimeS) || goalTimeS <= 0) {
    return err('DURATION_NOT_POSITIVE', 'Goal time must be greater than zero.', {
      field: 'duration',
    });
  }

  const goalSpm = goalTimeS / goalDistanceM;

  // Seconds per KM relative to goal race pace. Positive = slower.
  const deltas: Record<ZoneId, { slow: number; fast: number }> = {
    easy: { slow: 95, fast: 55 },
    marathon: { slow: 20, fast: 0 },
    threshold: { slow: -5, fast: -25 },
    interval: { slow: -35, fast: -60 },
    repetition: { slow: -65, fast: -100 },
  };

  const zones: Zone[] = ZONE_IDS.map((id) => {
    const d = deltas[id];
    const caps = VDOT.zoneDurationCapsMinutes[id];
    return {
      id,
      label: zoneLabel[id],
      slowSpm: asSecPerMetre(goalSpm + d.slow / 1000),
      fastSpm: asSecPerMetre(goalSpm + d.fast / 1000),
      purpose: VDOT.zones[id].purpose,
      durationCapMinutes: { min: caps.min, max: caps.max },
    };
  });

  return ok({
    zones,
    strategyId: 'goal_deltas',
    prov: provenance(
      [
        {
          id: 'goal_deltas',
          version: '1.0.0',
          calibration: 'provisional',
          params: { goalDistanceM, goalTimeS },
          source: 'generic offsets from goal race pace',
        },
      ],
      computedAt,
    ),
  });
};

// ---------------------------------------------------------------------------
// Consensus view — the differentiator
// ---------------------------------------------------------------------------

export interface ConsensusZone {
  readonly id: ZoneId;
  readonly label: string;
  /** Widest band: slowest slow-end (max slowSpm). */
  readonly unionSlowSpm: SecPerMetre;
  /** Widest band: fastest fast-end (min fastSpm). */
  readonly unionFastSpm: SecPerMetre;
  /** Where ALL strategies overlap: slowest shared end (min slowSpm). Null if empty. */
  readonly agreedSlowSpm: SecPerMetre | null;
  /** Where ALL strategies overlap: fastest shared end (max fastSpm). */
  readonly agreedFastSpm: SecPerMetre | null;
  /** Spread between midpoints across strategies, s/m. */
  readonly spreadSpm: number;
  readonly spreadPercent: number;
  readonly agreement: 'strong' | 'moderate' | 'poor';
  readonly contributors: readonly string[];
}

export interface ConsensusTable {
  readonly zones: readonly ConsensusZone[];
  readonly strategies: readonly string[];
  readonly prov: Provenance;
}

/**
 * Combine several zone tables.
 *
 * For a zone's interval [fastSpm, slowSpm]:
 *   union        = [min fastSpm, max slowSpm]
 *   intersection = [max fastSpm, min slowSpm]   (empty if max fast > min slow)
 */
export const consensus = (
  tables: readonly ZoneTable[],
  computedAt: string,
): Result<ConsensusTable> => {
  if (tables.length === 0) return err('INSUFFICIENT_INPUT', 'No strategy tables to combine.');

  const zones: ConsensusZone[] = [];

  for (const id of ZONE_IDS) {
    // Keep the pairing between table and zone so contributors stay accurate.
    const pairs: { strategyId: string; zone: Zone }[] = [];
    for (const t of tables) {
      const z = t.zones.find((candidate) => candidate.id === id);
      if (z) pairs.push({ strategyId: t.strategyId, zone: z });
    }
    if (pairs.length === 0) continue;

    const fasts = pairs.map((p) => p.zone.fastSpm);
    const slows = pairs.map((p) => p.zone.slowSpm);

    const unionFast = Math.min(...fasts);
    const unionSlow = Math.max(...slows);
    const agreedFast = Math.max(...fasts); // slowest of the fast ends
    const agreedSlow = Math.min(...slows); // fastest of the slow ends

    const overlaps = agreedFast < agreedSlow;

    const mids = pairs.map((p) => (p.zone.fastSpm + p.zone.slowSpm) / 2);
    const meanMid = mids.reduce((a, b) => a + b, 0) / mids.length;
    const spreadSpm = Math.max(...mids) - Math.min(...mids);
    const spreadPercent = meanMid > 0 ? spreadSpm / meanMid : 0;

    const agreement: ConsensusZone['agreement'] =
      spreadPercent < 0.03 ? 'strong' : spreadPercent < 0.07 ? 'moderate' : 'poor';

    zones.push({
      id,
      label: zoneLabel[id],
      unionSlowSpm: asSecPerMetre(unionSlow),
      unionFastSpm: asSecPerMetre(unionFast),
      agreedSlowSpm: overlaps ? asSecPerMetre(agreedSlow) : null,
      agreedFastSpm: overlaps ? asSecPerMetre(agreedFast) : null,
      spreadSpm,
      spreadPercent,
      agreement,
      contributors: pairs.map((p) => p.strategyId),
    });
  }

  const warnings: Warning[] = [];
  if (tables.some((t) => t.prov.warnings.length > 0)) {
    warnings.push(
      warn('PROVISIONAL_CONSTANTS', 'One or more contributing strategies is uncalibrated.'),
    );
  }
  if (zones.some((z) => z.agreement === 'poor')) {
    warnings.push(
      warn(
        'VALID_RANGE',
        'The strategies disagree substantially in at least one zone. That is worth ' +
          'showing, not smoothing over.',
      ),
    );
  }

  return ok({
    zones,
    strategies: tables.map((t) => t.strategyId),
    prov: provenance(
      [
        {
          id: 'consensus',
          version: '1.0.0',
          calibration: 'provisional',
          params: { strategies: tables.length },
          source: 'union and intersection across methodologies',
        },
      ],
      computedAt,
      warnings,
    ),
  });
};

// ---------------------------------------------------------------------------
// Duration-cap validation: an 8-minute "interval" rep is a specification error.
// ---------------------------------------------------------------------------

export const validateBoutLength = (
  zone: ZoneId,
  minutes: number,
): Result<{ valid: boolean; note?: string }> => {
  const cap = VDOT.zoneDurationCapsMinutes[zone];
  if (minutes < cap.min) {
    return ok({ valid: false, note: `${zone} bouts are usually at least ${cap.min} min.` });
  }
  if (minutes > cap.max) {
    return ok({
      valid: false,
      note: `${zone} bouts should not exceed ${cap.max} min — that changes the stimulus.`,
    });
  }
  return ok({ valid: true });
};
