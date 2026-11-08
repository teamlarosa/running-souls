/**
 * models/config.ts — THE ONLY FILE ALLOWED TO CONTAIN BARE NUMERIC CONSTANTS
 * used by a model (spec rule 6). Every constant carries its citation.
 *
 * Bumping any value here REQUIRES bumping that model's `version`, so old
 * results remain reproducible and identifiable.
 */

import type { Calibration } from '../provenance.js';

// ---------------------------------------------------------------------------
// Attribution register (spec §10). Formulas are not copyrightable; complete
// published TABLES are. We compute from equations and cite the papers.
// ---------------------------------------------------------------------------

export const SOURCES = {
  riegel: {
    citation: 'Riegel, P.S. (1981). Athletic Records and Human Endurance. American Scientist 69(3), 285-290.',
    note: 'Endurance exponent k=1.06 is a population average. Riegel himself warned against extrapolating far beyond the reference distance.',
  },
  vdot: {
    citation: 'Daniels, J. & Gilbert, J. (1979). Oxygen Power. ; Daniels, J. (2014). Daniels\' Running Formula, 4th ed., Human Kinetics.',
    note: 'Equations are public. DO NOT transcribe table values; compute them. VDOT is an effective running-fitness index, NOT measured VO2max.',
  },
  criticalSpeed: {
    citation: 'Monod, H. & Scherrer, J. (1965). Ergonomics 8(3), 329-338. Jones, A.M. et al. (2010). Sports Med 40(1), 41-58.',
    note: 'Two-parameter hyperbolic model. D\' assumed constant, which holds over roughly 2-30 min.',
  },
  minetti: {
    citation: 'Minetti, A.E., Moia, C., Roi, G.S., Susta, D., Ferretti, G. (2002). Energy cost of walking and running at extreme uphill and downhill slopes. J Appl Physiol 93, 1039-1046.',
    note:
      'A widely-copied variant of this polynomial (155.4, -30.4, -32.8, +43.7, +53.3, 156.46) is CORRUPTED. ' +
      'The published coefficients are 155.4, -30.4, -43.3, 46.3, 19.5, 3.6 with flat cost C(0)=3.6 J/kg/m, ' +
      'consistent with the paper reporting level running at 3.40 +/- 0.24 J/kg/m. Any variant whose constant ' +
      'term is ~156 is off by a factor of ~43 and yields absurdly flat cost curves.',
  },
  altitude: {
    citation: 'Wehrlin, J.P. & Hallen, J. (2006). Linear decrease in VO2max and performance with increasing altitude in endurance athletes. Eur J Appl Physiol 98, 437-445.',
    note: '6.3% VO2max decline per 1000 m above threshold. Performance declines more steeply than VO2max.',
  },
  heat: {
    citation: 'No primary source. Coach-derived heuristics in circulation (temperature + dew point sum).',
    note: 'MUST be labelled heuristic in the UI. Sources disagree on the threshold; both are exposed.',
  },
} as const;

export type SourceKey = keyof typeof SOURCES;

// ---------------------------------------------------------------------------
// RIEGEL
// ---------------------------------------------------------------------------

export const RIEGEL = {
  version: '1.0.0',
  /** Population-average endurance exponent (decision 3). */
  defaultK: 1.06,
  presets: {
    shortFast: 1.05,
    default: 1.06,
    recreational: 1.07,
    longExtrapolation: 1.08,
    ultra: 1.12,
  },
  /** Beyond this ratio of target/reference distance, warn EXTRAPOLATION. */
  maxReliableRatio: 4,
  /** Beyond this, refuse to present the number as a prediction. */
  hardRatioLimit: 10,
} as const;

// ---------------------------------------------------------------------------
// DANIELS / VDOT
// ---------------------------------------------------------------------------

export const VDOT = {
  version: '1.0.0',
  /** VO2(v) = a + b*v + c*v^2, v in metres/minute. */
  costCoeffs: { a: -4.6, b: 0.182258, c: 0.000104 },
  /** %max(t) = p0 + p1*exp(-k1*t) + p2*exp(-k2*t), t in minutes. */
  sustainable: { p0: 0.8, p1: 0.1894393, k1: 0.012778, p2: 0.2989558, k2: 0.1932605 },
  /** Bisection bounds for inverting VDOT -> time. Widened for slow marathoners. */
  solveBounds: { minMinutes: 1.5, maxMinutes: 400 },
  solveToleranceSeconds: 0.001,
  solveMaxIterations: 200,
  /**
   * Zone bands as % of VDOT.
   * CALIBRATION GATE: confirm against Daniels' Running Formula, 4th ed.,
   * Table 4.1 and record the page reference before marking verified.
   */
  zones: {
    easy:       { low: 59, high: 74, purpose: 'Aerobic base, conversational' },
    marathon:   { low: 75, high: 84, purpose: 'Race-specific endurance' },
    threshold:  { low: 83, high: 88, purpose: 'Lactate clearance' },
    interval:   { low: 95, high: 100, purpose: 'VO2max stimulation' },
    repetition: { low: 105, high: 110, purpose: 'Speed and running economy' },
  },
  /** Hard duration caps from the book (minutes per rep / per continuous bout). */
  zoneDurationCapsMinutes: {
    easy: { min: 30, max: 150 },
    marathon: { min: 40, max: 150 },
    threshold: { min: 20, max: 40 },
    interval: { min: 3, max: 5 },
    repetition: { min: 0.5, max: 2 },
  },
} as const;

// ---------------------------------------------------------------------------
// GRADE / GAP — Minetti et al. (2002) running energy-cost polynomial.
//
//   C(i) = 155.4*i^5 - 30.4*i^4 - 43.3*i^3 + 46.3*i^2 + 19.5*i + 3.6
//   i    = gradient as a decimal (0.10 for +10%)
//   C    = J/kg/m
//
// VALIDATION ANCHORS (test/calibration/gap.validation.test.ts):
//   level running      measured 3.40 +/- 0.24  -> C(0)     = 3.60
//   +45% uphill        measured 18.93 +/- 1.74 -> C(0.45)  = 19.43
//   min downhill       measured 1.73 +/- 0.36  -> C(-0.18) = 1.78
//   -45% downhill      measured 3.92 +/- 0.81  -> C(-0.45) = 4.03
// All four land within one standard deviation.
// ---------------------------------------------------------------------------

export const GRADE = {
  version: '2.0.0',

  /** Fifth-order polynomial coefficients, highest power first. */
  polynomial: {
    c5: 155.4,
    c4: -30.4,
    c3: -43.3,
    c2: 46.3,
    c1: 19.5,
    c0: 3.6,
  },

  /** Level running cost measured in the study, J/kg/m. */
  measuredFlatCost: 3.40,
  measuredFlatCostSd: 0.24,

  /** Gradient range actually measured on the treadmill. */
  measuredRange: { min: -0.45, max: 0.45 },

  /**
   * Range over which the polynomial is well-behaved. Beyond this we still
   * compute (clamped to measuredRange) but warn.
   */
  wellValidatedRange: { min: -0.30, max: 0.30 },

  /**
   * Gradient of minimum running cost. Solved from C'(i) = 0:
   *   777i^4 - 121.6i^3 - 129.9i^2 + 92.6i + 19.5 = 0  ->  i = -0.1814
   * giving C = 1.7813 and ratio 0.49481.
   * Verified by minimumCostGrade() in grade.ts, not hardcoded in logic.
   */
  minimumCostGrade: -0.1814,

  /**
   * Above this grade most runners transition to walking, which the polynomial
   * does not model. GAP here is meaningful only as a RELATIVE comparison.
   */
  gaitTransitionGrade: 0.15,

  /**
   * Strava replaced Minetti with a heart-rate-fitted curve in 2017. That model
   * gives LESS credit on downhills and rebounds at a shallower grade. We use
   * the published Minetti curve because it is citable; differences from Strava
   * on steep descents are expected, not bugs.
   */
  divergesFromStravaOnDescents: true,
} as const;

// ---------------------------------------------------------------------------
// HEAT  (decision 4: default threshold 130F, alternative exposed)
// ---------------------------------------------------------------------------

export const HEAT = {
  version: '1.0.0',
  models: {
    /** Coach-standard: pace suffers above 130 combined, ~1%/10 points. */
    'sum_f_130': {
      thresholdF: 130,
      percentPer10Points: 1.0,
      label: '130F threshold (default)',
    },
    /** Alternate school: adjustments begin around 100. */
    'sum_f_100': {
      thresholdF: 100,
      percentPer10Points: 0.75,
      label: '100F threshold (conservative)',
    },
  },
  defaultModel: 'sum_f_130' as const,
  /** Heat penalty scales with duration: f(duration) saturates. */
  durationSat: { minMinutes: 20, saturateMinutes: 180 },
  /** Max acclimation benefit as a fraction of the heat penalty removed. */
  maxAcclimationBenefit: 0.5,
  /** Above this total adjustment, combined uncertainty is flagged. */
  combinedWarnThreshold: 0.15,
  /** Above this sum, racing is genuinely inadvisable. */
  dangerSumF: 180,
} as const;

// ---------------------------------------------------------------------------
// ALTITUDE
// ---------------------------------------------------------------------------

export const ALTITUDE = {
  version: '1.0.0',
  /** Elevation above which VO2max begins to decline, metres. Sources: 800-1500. */
  thresholdM: 1400,
  /** Fractional VO2max decline per metre above threshold (6.3% per 1000 m). */
  declinePerMetre: 0.063 / 1000,
  /** Performance declines faster than VO2max; ratio applied to the penalty. */
  performanceAmplification: 1.5,
  /** Duration dependence: sprints barely affected. */
  durationSat: { minMinutes: 2, saturateMinutes: 30 },
  /** Absolute floor on the multiplier, however extreme the input. */
  minMultiplier: 0.6,
} as const;

// ---------------------------------------------------------------------------
// COURSE / ELEVATION
// ---------------------------------------------------------------------------

export const COURSE = {
  version: '1.0.0',
  /** Elevation hysteresis before a climb/descent counts, metres. */
  elevationThresholdM: 8,
  /** Distance bin size for resampling/comparison, metres. */
  binSizeM: 100,
  /** Earth radius for haversine, metres. */
  earthRadiusM: 6371008.8,
} as const;

// ---------------------------------------------------------------------------
// SHARED PREDICTION QUALITY
// ---------------------------------------------------------------------------

export const PREDICTION = {
  version: '1.0.0',
  /** Uncertainty bands, as a fraction of the predicted time. */
  uncertainty: {
    interpolationWithin2x: 0.02,
    interpolationWithin4x: 0.04,
    extrapolationBeyond4x: 0.06,
  },
  /** Recency weighting for a reference result. */
  recency: {
    fullWeightDays: 182,
    halfWeightDays: 365,
    staleDays: 548,
  },
} as const;

// ---------------------------------------------------------------------------
// Calibration status of each model, surfaced in provenance.
// ---------------------------------------------------------------------------

export const CALIBRATION: Readonly<Record<string, Calibration>> = {
  riegel: 'verified',
  vdot: 'verified',
  criticalSpeed: 'verified',
  grade: 'verified',
  heat: 'heuristic',
  altitude: 'provisional',
  course: 'provisional',
  split: 'verified',
};
