/**
 * errors.ts — typed failures. The engine never throws on user input and
 * never returns NaN or Infinity in a result field (property test in §9.2).
 */

export type EngineErrorCode =
  // input validation
  | 'DISTANCE_NOT_POSITIVE'
  | 'DURATION_NOT_POSITIVE'
  | 'PACE_NOT_POSITIVE'
  | 'SPEED_OUT_OF_RANGE'
  | 'INSUFFICIENT_INPUT'      // solver needs exactly 2 of 3
  | 'AMBIGUOUS_INPUT'         // too many of the three supplied
  // parsing
  | 'PARSE_EMPTY'
  | 'PARSE_TIME_FORMAT'
  | 'PARSE_TIME_RANGE'
  | 'PARSE_NUMBER_FORMAT'
  | 'PARSE_UNKNOWN_UNIT'
  | 'PARSE_AMBIGUOUS_NUMBER'
  // model-specific
  | 'CS_INPUTS_TOO_CLOSE'     // critical speed: delta T < 120 s
  | 'VDOT_SOLVE_FAILED'       // bisection did not converge
  | 'OUT_OF_VALID_RANGE';     // model applied outside its domain

export interface EngineError {
  readonly ok: false;
  readonly code: EngineErrorCode;
  readonly message: string;
  /** Which input caused it, for form highlighting. */
  readonly field?: 'distance' | 'duration' | 'pace' | 'speed';
  /** Character offset for parse errors. */
  readonly offset?: number;
}

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export type Result<T> = Ok<T> | EngineError;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = (
  code: EngineErrorCode,
  message: string,
  extra?: { field?: EngineError['field']; offset?: number },
): EngineError => ({ ok: false, code, message, ...extra });

export const isErr = <T>(r: Result<T>): r is EngineError => !r.ok;
