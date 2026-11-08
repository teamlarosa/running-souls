/**
 * state.ts — calculator state and derived values.
 *
 * Owns input parsing and the single core pace solve. Everything downstream
 * (zones, splits, predictions, conditions) is derived in the components that
 * display it, so a slow model never blocks the hero number.
 *
 * The engine never reads the clock, so `computedAt` is fixed once per session.
 * That also makes results reproducible for a given set of inputs.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DISTANCES,
  asMetres,
  asSeconds,
  DEFAULT_UNIT_SYSTEM,
  parseDuration,
  parsePace,
  solvePace,
  type BandStrategy,
  type DistanceId,
  type PaceResult,
  type SecPerMetre,
  type SplitUnit,
  type UnitSystem,
} from '@running/engine';
import { metresPerUnit, paceClock } from './format';

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
  fieldError: { field: 'distance' | 'duration' | 'pace'; message: string } | null;
}

const INITIAL: CalcState = {
  distanceId: '10000m',
  customDistance: '',
  unit: DEFAULT_UNIT_SYSTEM,
  timeStr: '50:00',
  paceStr: '',
  active: 'time',
  splitUnit: DEFAULT_UNIT_SYSTEM === 'imperial' ? 'mi' : 'km',
  bandStrategy: 'even',
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

/** Trim a converted number to at most 3 decimals, without trailing zeros. */
const trimNum = (n: number): string => String(Math.round(n * 1000) / 1000);

const num = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw.replace(',', '.')));

/**
 * Rewrite unit-dependent strings when the user flips mi/km.
 *
 * Time is unit-independent. The custom distance and the typed pace are not, so
 * both are converted rather than left to silently mean something different.
 */
const convertUnit = (prev: CalcState, next: UnitSystem): CalcState => {
  if (prev.unit === next) return prev;

  const factor = metresPerUnit(prev.unit) / metresPerUnit(next);

  let customDistance = prev.customDistance;
  const customValue = num(prev.customDistance);
  if (Number.isFinite(customValue) && customValue > 0) {
    customDistance = trimNum(customValue * factor);
  }

  let paceStr = prev.paceStr;
  if (prev.active === 'pace' && prev.paceStr.trim() !== '') {
    const parsed = parsePace(prev.paceStr, prev.unit === 'imperial' ? 'mi' : 'km');
    if (parsed.ok) {
      paceStr = paceClock(parsed.value * metresPerUnit(next));
    }
  }

  return { ...prev, unit: next, customDistance, paceStr };
};

const EMPTY: Derived = {
  distanceM: null,
  seconds: null,
  spm: null,
  result: null,
  fieldError: null,
};

const compute = (state: CalcState, computedAt: string): Derived => {
  // --- distance -----------------------------------------------------------
  let distanceM: number;

  if (state.distanceId === 'custom') {
    const raw = state.customDistance.trim();
    if (raw === '') return EMPTY;

    const value = num(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return {
        ...EMPTY,
        fieldError: { field: 'distance', message: 'Enter a distance greater than zero.' },
      };
    }
    distanceM = value * metresPerUnit(state.unit);
  } else {
    distanceM = DISTANCES[state.distanceId].m;
  }

  // --- the active input ---------------------------------------------------
  if (state.active === 'time') {
    if (state.timeStr.trim() === '') return { ...EMPTY, distanceM };

    const parsed = parseDuration(state.timeStr);
    if (!parsed.ok) {
      return { ...EMPTY, distanceM, fieldError: { field: 'duration', message: parsed.message } };
    }

    const solved = solvePace(
      { distance: asMetres(distanceM), duration: asSeconds(parsed.value) },
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
      fieldError: null,
    };
  }

  // active === 'pace'
  if (state.paceStr.trim() === '') return { ...EMPTY, distanceM };

  const parsedPace = parsePace(state.paceStr, state.unit === 'imperial' ? 'mi' : 'km');
  if (!parsedPace.ok) {
    return { ...EMPTY, distanceM, fieldError: { field: 'pace', message: parsedPace.message } };
  }

  const solved = solvePace(
    { distance: asMetres(distanceM), pace: parsedPace.value as SecPerMetre },
    computedAt,
  );

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
    fieldError: null,
  };
};

export interface Calculator {
  state: CalcState;
  derived: Derived;
  computedAt: string;
  setField: <K extends keyof CalcState>(key: K, value: CalcState[K]) => void;
  setCondition: <K extends keyof ConditionsState>(key: K, value: ConditionsState[K]) => void;
  setUnit: (next: UnitSystem) => void;
}

export function useCalculator(): Calculator {
  const [state, setState] = useState<CalcState>(INITIAL);
  const computedAtRef = useRef(new Date().toISOString());

  const computedAt = computedAtRef.current;
  const derived = useMemo(() => compute(state, computedAt), [state, computedAt]);

  const setField = useCallback(<K extends keyof CalcState>(key: K, value: CalcState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setCondition = useCallback(
    <K extends keyof ConditionsState>(key: K, value: ConditionsState[K]) => {
      setState((prev) => ({ ...prev, conditions: { ...prev.conditions, [key]: value } }));
    },
    [],
  );

  const setUnit = useCallback((next: UnitSystem) => {
    setState((prev) => convertUnit(prev, next));
  }, []);

  return { state, derived, computedAt, setField, setCondition, setUnit };
}
