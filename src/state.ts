/**
 * state.ts — calculator state and derived values.
 *
 * Two copies of the inputs:
 *   draft     — what the user is typing right now
 *   committed — a snapshot taken when they press Calculate
 *
 * All results (hero, training paces, splits, predictions, conditions) come from
 * the committed snapshot, so nothing changes until Calculate is pressed.
 * `stale` is true when the draft no longer matches the snapshot.
 *
 * The engine never reads the clock, so `computedAt` is fixed once per session.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DISTANCES,
  asMetres,
  asSeconds,
  DEFAULT_UNIT_SYSTEM,
  solvePace,
  type BandStrategy,
  type DistanceId,
  type PaceResult,
  type SecPerMetre,
  type SplitUnit,
  type UnitSystem,
} from '@running/engine';
import { metresPerUnit } from './format';

export type ActiveField = 'time' | 'pace';

export interface ConditionsState {
  gradeOn: boolean;
  gradePct: string;
  heatOn: boolean;
  tempF: string;
  dewPointF: string;
  altitudeOn: boolean;
  elevationM: string;
}

/** Live input values, exactly as typed. */
export interface Draft {
  distanceId: DistanceId | 'custom';
  customDistance: string;
  unit: UnitSystem;
  timeH: string;
  timeM: string;
  timeS: string;
  paceM: string;
  paceS: string;
  active: ActiveField;
  conditions: ConditionsState;
}

interface DisplayPrefs {
  splitUnit: SplitUnit;
  bandStrategy: BandStrategy;
}

/**
 * What the result cards read. Reflects the last Calculate press.
 * timeStr / paceStr are canonical strings built from the digit boxes.
 */
export interface CalcState {
  distanceId: DistanceId | 'custom';
  customDistance: string;
  unit: UnitSystem;
  timeStr: string;
  paceStr: string;
  active: ActiveField;
  splitUnit: SplitUnit;
  bandStrategy: BandStrategy;
  conditions: ConditionsState;
}

export interface Derived {
  distanceM: number | null;
  seconds: number | null;
  /** Branded s/m, so it can be handed straight back to engine functions. */
  spm: SecPerMetre | null;
  result: PaceResult | null;
  /** Which quantity was solved: 'time' input → pace result, 'pace' input → time result. */
  solvedFor: ActiveField | null;
  fieldError: { field: 'distance' | 'duration' | 'pace'; message: string } | null;
}

export interface DraftErrors {
  distance: string | null;
  time: string | null;
  pace: string | null;
}

const INITIAL_DRAFT: Draft = {
  distanceId: '10000m',
  customDistance: '',
  unit: DEFAULT_UNIT_SYSTEM,
  timeH: '',
  timeM: '',
  timeS: '',
  paceM: '',
  paceS: '',
  active: 'time',
  conditions: {
    gradeOn: false,
    gradePct: '2',
    heatOn: false,
    tempF: '75',
    dewPointF: '62',
    altitudeOn: false,
    elevationM: '1600',
  },
};

const INITIAL_DISPLAY: DisplayPrefs = {
  splitUnit: DEFAULT_UNIT_SYSTEM === 'imperial' ? 'mi' : 'km',
  bandStrategy: 'even',
};

// ---------------------------------------------------------------------------
// Small helpers (exported where the UI needs them)
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Digits-only string → integer. Empty or junk → 0. */
export const toInt = (raw: string): number => {
  const v = parseInt(raw, 10);
  return Number.isFinite(v) ? v : 0;
};

/** Decimal parse for the custom distance box. Empty → NaN. */
const num = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw.replace(',', '.')));

export const timeSeconds = (d: Draft): number =>
  toInt(d.timeH) * 3600 + toInt(d.timeM) * 60 + toInt(d.timeS);

export const paceSecondsPerUnit = (d: Draft): number => toInt(d.paceM) * 60 + toInt(d.paceS);

/** All-zero counts as empty. */
export const hasTimeInput = (d: Draft): boolean => timeSeconds(d) > 0;
export const hasPaceInput = (d: Draft): boolean => paceSecondsPerUnit(d) > 0;

/**
 * Which input group drives the calculation.
 * The last-edited group wins, unless it is empty and the other has a value.
 */
export const solveFor = (d: Draft): ActiveField => {
  if (d.active === 'time') {
    return !hasTimeInput(d) && hasPaceInput(d) ? 'pace' : 'time';
  }
  return !hasPaceInput(d) && hasTimeInput(d) ? 'time' : 'pace';
};

/** Live validation, used both for inline messages and before solving. */
export const validate = (d: Draft): DraftErrors => {
  let distance: string | null = null;
  if (d.distanceId === 'custom' && d.customDistance.trim() !== '') {
    const v = num(d.customDistance);
    if (!Number.isFinite(v) || v <= 0) distance = 'Enter a distance greater than zero.';
  }

  let time: string | null = null;
  if (toInt(d.timeM) > 59) time = 'Minutes must be under 60.';
  else if (toInt(d.timeS) > 59) time = 'Seconds must be under 60.';

  let pace: string | null = null;
  if (toInt(d.paceS) > 59) pace = 'Seconds must be under 60.';

  return { distance, time, pace };
};

/** Key of everything that affects the result. Equal keys → result is current. */
const inputKey = (d: Draft): string => {
  const mode = solveFor(d);
  const c = d.conditions;
  return JSON.stringify([
    d.distanceId,
    d.distanceId === 'custom' ? d.customDistance.trim() : '',
    d.unit,
    mode,
    mode === 'time'
      ? [toInt(d.timeH), toInt(d.timeM), toInt(d.timeS)]
      : [toInt(d.paceM), toInt(d.paceS)],
    c.gradeOn ? c.gradePct.trim() : null,
    c.heatOn ? [c.tempF.trim(), c.dewPointF.trim()] : null,
    c.altitudeOn ? c.elevationM.trim() : null,
  ]);
};

const toCalcState = (d: Draft, display: DisplayPrefs): CalcState => ({
  distanceId: d.distanceId,
  customDistance: d.customDistance,
  unit: d.unit,
  timeStr: hasTimeInput(d)
    ? `${toInt(d.timeH)}:${pad2(toInt(d.timeM))}:${pad2(toInt(d.timeS))}`
    : '',
  paceStr: hasPaceInput(d) ? `${toInt(d.paceM)}:${pad2(toInt(d.paceS))}` : '',
  active: solveFor(d),
  splitUnit: display.splitUnit,
  bandStrategy: display.bandStrategy,
  conditions: d.conditions,
});

/** Trim a converted number to at most 3 decimals, without trailing zeros. */
const trimNum = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Rewrite unit-dependent values when the user flips mi/km.
 * Time is unit-independent. Custom distance and typed pace are converted
 * rather than left to silently mean something different.
 */
const convertUnit = (prev: Draft, next: UnitSystem): Draft => {
  if (prev.unit === next) return prev;

  const factor = metresPerUnit(prev.unit) / metresPerUnit(next);

  let customDistance = prev.customDistance;
  const customValue = num(prev.customDistance);
  if (Number.isFinite(customValue) && customValue > 0) {
    customDistance = trimNum(customValue * factor);
  }

  let { paceM, paceS } = prev;
  const paceTotal = paceSecondsPerUnit(prev);
  if (paceTotal > 0) {
    const converted = Math.round((paceTotal * metresPerUnit(next)) / metresPerUnit(prev.unit));
    paceM = String(Math.floor(converted / 60));
    paceS = pad2(converted % 60);
  }

  return { ...prev, unit: next, customDistance, paceM, paceS };
};

// ---------------------------------------------------------------------------
// The core solve
// ---------------------------------------------------------------------------

const EMPTY: Derived = {
  distanceM: null,
  seconds: null,
  spm: null,
  result: null,
  solvedFor: null,
  fieldError: null,
};

const compute = (d: Draft, computedAt: string): Derived => {
  const errors = validate(d);

  // --- distance -----------------------------------------------------------
  let distanceM: number;

  if (d.distanceId === 'custom') {
    if (d.customDistance.trim() === '') return EMPTY;
    if (errors.distance) {
      return { ...EMPTY, fieldError: { field: 'distance', message: errors.distance } };
    }
    distanceM = num(d.customDistance) * metresPerUnit(d.unit);
  } else {
    distanceM = DISTANCES[d.distanceId].m;
  }

  const mode = solveFor(d);

  // --- distance + time → pace --------------------------------------------
  if (mode === 'time') {
    const seconds = timeSeconds(d);
    if (seconds <= 0) return { ...EMPTY, distanceM };
    if (errors.time) {
      return { ...EMPTY, distanceM, fieldError: { field: 'duration', message: errors.time } };
    }

    const solved = solvePace(
      { distance: asMetres(distanceM), duration: asSeconds(seconds) },
      computedAt,
    );

    if (!solved.ok) {
      return {
        ...EMPTY,
        distanceM,
        fieldError: {
          field: solved.field === 'distance' ? 'distance' : 'duration',
          message: solved.message,
        },
      };
    }

    return {
      distanceM,
      seconds: solved.value.duration,
      spm: solved.value.pace,
      result: solved.value,
      solvedFor: 'time',
      fieldError: null,
    };
  }

  // --- distance + pace → finish time -------------------------------------
  const perUnit = paceSecondsPerUnit(d);
  if (perUnit <= 0) return { ...EMPTY, distanceM };
  if (errors.pace) {
    return { ...EMPTY, distanceM, fieldError: { field: 'pace', message: errors.pace } };
  }

  const spm = (perUnit / metresPerUnit(d.unit)) as SecPerMetre;
  const solved = solvePace({ distance: asMetres(distanceM), pace: spm }, computedAt);

  if (!solved.ok) {
    return {
      ...EMPTY,
      distanceM,
      fieldError: {
        field: solved.field === 'distance' ? 'distance' : 'pace',
        message: solved.message,
      },
    };
  }

  return {
    distanceM,
    seconds: solved.value.duration,
    spm: solved.value.pace,
    result: solved.value,
    solvedFor: 'pace',
    fieldError: null,
  };
};

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface Calculator {
  /** Result-side state: reflects the last Calculate press. */
  state: CalcState;
  derived: Derived;
  computedAt: string;

  /** Input-side state: live, as typed. */
  draft: Draft;
  errors: DraftErrors;
  solveFor: ActiveField;
  hasCalculated: boolean;
  /** True when inputs have changed since the last Calculate. */
  stale: boolean;

  setInput: (patch: Partial<Draft>) => void;
  setCondition: <K extends keyof ConditionsState>(key: K, value: ConditionsState[K]) => void;
  setUnit: (next: UnitSystem) => void;
  calculate: () => void;

  /** Kept for the result cards: split unit and band strategy apply immediately. */
  setField: <K extends keyof CalcState>(key: K, value: CalcState[K]) => void;
}

export function useCalculator(): Calculator {
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [committed, setCommitted] = useState<Draft | null>(null);
  const [display, setDisplay] = useState<DisplayPrefs>(INITIAL_DISPLAY);
  const computedAtRef = useRef(new Date().toISOString());
  const computedAt = computedAtRef.current;

  const derived = useMemo(
    () => (committed ? compute(committed, computedAt) : EMPTY),
    [committed, computedAt],
  );

  const state = useMemo(
    () => toCalcState(committed ?? draft, display),
    [committed, draft, display],
  );

  const errors = useMemo(() => validate(draft), [draft]);
  const stale = committed !== null && inputKey(draft) !== inputKey(committed);

  const setInput = useCallback((patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const setCondition = useCallback(
    <K extends keyof ConditionsState>(key: K, value: ConditionsState[K]) => {
      setDraft((prev) => ({ ...prev, conditions: { ...prev.conditions, [key]: value } }));
    },
    [],
  );

  const setUnit = useCallback((next: UnitSystem) => {
    setDraft((prev) => convertUnit(prev, next));
    setCommitted((prev) => (prev ? convertUnit(prev, next) : prev));
  }, []);

  const calculate = useCallback(() => {
    setCommitted(draft);
  }, [draft]);

  const setField = useCallback(
    <K extends keyof CalcState>(key: K, value: CalcState[K]) => {
      if (key === 'splitUnit' || key === 'bandStrategy') {
        setDisplay((prev) => ({ ...prev, [key]: value }) as DisplayPrefs);
      } else if (key === 'distanceId' || key === 'customDistance') {
        setDraft((prev) => ({ ...prev, [key]: value }) as Draft);
      }
      // Other keys are derived from the digit boxes and are not set directly.
    },
    [],
  );

  return {
    state,
    derived,
    computedAt,
    draft,
    errors,
    solveFor: solveFor(draft),
    hasCalculated: committed !== null,
    stale,
    setInput,
    setCondition,
    setUnit,
    calculate,
    setField,
  };
}
