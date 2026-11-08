/**
 * @engine — public API surface.
 *
 * Rules: pure, dependency-free, no UI, no network, no clock, no randomness.
 * Every value-producing function returns a Result<T> carrying Provenance.
 */

// Foundation
export * from './units.js';
export * from './errors.js';
export * from './provenance.js';
export * from './distances.js';
export * from './format.js';
export * from './parse.js';

// Core modules
export * from './pace.js';
export * from './split.js';
export * from './course.js';

// Models
export * from './modules/riegel.js';
export * from './modules/vdot.js';
export * from './modules/criticalspeed.js';
export * from './modules/grade.js';
export * from './modules/heat.js';
export * from './modules/altitude.js';
export * from './modules/tpace.js';

// Constants. Re-exported deliberately: the UI must be able to show citations,
// and tests must be able to assert against the configured values.
export * as config from './models/config.js';
export {
  ALTITUDE,
  CALIBRATION,
  COURSE,
  GRADE,
  HEAT,
  PREDICTION,
  RIEGEL,
  SOURCES,
  VDOT,
} from './models/config.js';
