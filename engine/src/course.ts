/**
 * course.ts — Module COURSE. GPS import interfaces.
 *
 * v1 reserves the SHAPES only; parsing lands later. Non-obvious requirements
 * designed in from the start, because they are painful to retrofit:
 *
 *  - Elevation gain is THRESHOLD-DEPENDENT. Summing raw elevation differences
 *    inflates gain by 2-3x because of GPS noise. We use hysteresis and DISPLAY
 *    the threshold. Mismatched gain numbers are the #1 reason people distrust
 *    these tools.
 *  - declaredDistanceM vs computed distance WILL disagree (device odometry vs
 *    haversine). Keep both; never silently overwrite.
 *  - Distance uses haversine, not Euclidean lat/lon.
 *  - Parsing happens in the browser, no upload.
 */

import { err, ok, type Result } from './errors.js';
import { provenance, type Provenance } from './provenance.js';
import { COURSE } from './models/config.js';

export type ActivityFormat = 'gpx' | 'tcx' | 'fit';

export interface TrackPoint {
  /** Seconds since activity start. */
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  /** Elevation, metres. */
  readonly ele?: number;
  readonly hr?: number;
  readonly cadence?: number;
}

export interface Activity {
  readonly points: readonly TrackPoint[];
  readonly source: ActivityFormat;
  /** Device-reported total, often differs from the computed value. */
  readonly declaredDistanceM?: number;
  readonly declaredElevationGainM?: number;
  readonly prov?: Provenance;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, metres. */
export const haversine = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = COURSE.earthRadiusM;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Cumulative distance along a track, metres.
 *
 * `includeElevation` matters: on hilly courses, 3D distance differs from
 * horizontal by 0.1-1%. Decide explicitly rather than by accident.
 */
export const cumulativeDistances = (
  points: readonly TrackPoint[],
  includeElevation = false,
): readonly number[] => {
  const out: number[] = [];
  if (points.length === 0) return out;

  out.push(0);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) break;

    let d = haversine(prev.lat, prev.lon, cur.lat, cur.lon);
    if (includeElevation && prev.ele !== undefined && cur.ele !== undefined) {
      const dz = cur.ele - prev.ele;
      d = Math.sqrt(d * d + dz * dz);
    }
    const previousTotal = out[i - 1] ?? 0;
    out.push(previousTotal + d);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Elevation gain with hysteresis
// ---------------------------------------------------------------------------

export interface ElevationSummary {
  readonly gainM: number;
  readonly lossM: number;
  readonly minM: number;
  readonly maxM: number;
  /** The hysteresis threshold used, surfaced so the UI can display it. */
  readonly thresholdM: number;
}

/**
 * Elevation gain/loss using hysteresis: a climb only accumulates once it
 * exceeds `thresholdM`, which suppresses GPS noise. MUST be shown to the user.
 */
export const elevationSummary = (
  elevations: readonly number[],
  thresholdM = COURSE.elevationThresholdM,
): ElevationSummary => {
  const values = elevations.filter((e) => Number.isFinite(e));
  const first = values[0];
  if (first === undefined) {
    return { gainM: 0, lossM: 0, minM: 0, maxM: 0, thresholdM };
  }

  let gain = 0;
  let loss = 0;
  let anchor = first;

  for (let i = 1; i < values.length; i += 1) {
    const e = values[i];
    if (e === undefined) continue;
    const delta = e - anchor;
    if (delta >= thresholdM) {
      gain += delta;
      anchor = e;
    } else if (delta <= -thresholdM) {
      loss += -delta;
      anchor = e;
    }
  }

  return {
    gainM: gain,
    lossM: loss,
    minM: Math.min(...values),
    maxM: Math.max(...values),
    thresholdM,
  };
};

// ---------------------------------------------------------------------------
// Resampling — foundation for ALL course comparison
// ---------------------------------------------------------------------------

export interface Bin {
  readonly index: number;
  readonly startM: number;
  readonly endM: number;
  readonly distanceM: number;
  /** Net elevation change across the bin, metres. */
  readonly riseM: number;
  /** Fractional grade. */
  readonly grade: number;
  /** Seconds spent in the bin. */
  readonly durationS: number;
}

/** Binary search: index of the first cumulative distance >= target. */
const indexAtDistance = (cum: readonly number[], target: number): number => {
  const lastIdx = cum.length - 1;
  const last = cum[lastIdx];
  if (last === undefined) return 0;
  if (target <= 0) return 0;
  if (target >= last) return lastIdx;

  let lo = 0;
  let hi = lastIdx;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const v = cum[mid] ?? 0;
    if (v < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Resample a track into equal-distance bins. EVERY course comparison must
 * happen on resampled bins, never on raw points — raw points are unevenly
 * spaced and device-dependent.
 */
export const resample = (
  points: readonly TrackPoint[],
  binSizeM = COURSE.binSizeM,
): Result<readonly Bin[]> => {
  if (points.length < 2) {
    return err('INSUFFICIENT_INPUT', 'A track needs at least two points.');
  }
  if (!(binSizeM > 0)) {
    return err('OUT_OF_VALID_RANGE', 'Bin size must be positive.');
  }

  const cum = cumulativeDistances(points);
  const total = cum[cum.length - 1] ?? 0;
  if (!(total > 0)) {
    return err('OUT_OF_VALID_RANGE', 'The track has zero distance.');
  }

  const nBins = Math.max(1, Math.round(total / binSizeM));
  const actualBin = total / nBins;

  const bins: Bin[] = [];

  for (let k = 0; k < nBins; k += 1) {
    const startM = k * actualBin;
    const endM = (k + 1) * actualBin;
    const startPt = points[indexAtDistance(cum, startM)];
    const endPt = points[indexAtDistance(cum, endM)];

    if (startPt === undefined || endPt === undefined) {
      return err('OUT_OF_VALID_RANGE', 'Track indexing failed during resampling.');
    }

    const riseM =
      startPt.ele !== undefined && endPt.ele !== undefined ? endPt.ele - startPt.ele : 0;

    bins.push({
      index: k,
      startM,
      endM,
      distanceM: actualBin,
      riseM,
      grade: actualBin > 0 ? riseM / actualBin : 0,
      durationS: Math.max(0, endPt.t - startPt.t),
    });
  }

  return ok(bins);
};

// ---------------------------------------------------------------------------
// Course summary + comparison shapes (v2 fills the alignment logic)
// ---------------------------------------------------------------------------

export interface CourseSummary {
  readonly distanceM: number;
  readonly durationS?: number;
  readonly elevation: ElevationSummary;
  readonly bins: readonly Bin[];
  readonly declaredDistanceM?: number;
}

export interface SharedSegment {
  readonly startM: number;
  readonly endM: number;
  readonly lengthM: number;
}

export interface BinDelta {
  readonly distanceM: number;
  readonly gradeA: number;
  readonly gradeB: number;
  readonly deltaGrade: number;
  readonly deltaDurationS?: number;
}

export interface CourseComparison {
  readonly a: CourseSummary;
  readonly b: CourseSummary;
  /** v2: corridor/Frechet alignment. Empty until that lands. */
  readonly sharedSegments: readonly SharedSegment[];
  readonly deltas: readonly BinDelta[];
  readonly prov: Provenance;
}

export const summarise = (
  activity: Activity,
  computedAt: string,
): Result<CourseSummary> => {
  if (activity.points.length < 2) {
    return err('INSUFFICIENT_INPUT', 'A track needs at least two points.');
  }

  const cum = cumulativeDistances(activity.points);
  const binsResult = resample(activity.points);
  if (!binsResult.ok) return binsResult;

  const elevations: number[] = [];
  for (const p of activity.points) {
    if (p.ele !== undefined) elevations.push(p.ele);
  }

  const lastPoint = activity.points[activity.points.length - 1];

  return ok({
    distanceM: cum[cum.length - 1] ?? 0,
    durationS: lastPoint?.t,
    elevation: elevationSummary(elevations),
    bins: binsResult.value,
    declaredDistanceM: activity.declaredDistanceM,
  });
};

/**
 * Compare two courses bin-by-bin. v1: assumes bins already aligned by distance.
 * v2 adds shared-segment detection via corridor matching or Frechet distance —
 * the genuinely hard algorithmic work, deliberately deferred.
 */
export const compare = (
  a: CourseSummary,
  b: CourseSummary,
  computedAt: string,
): Result<CourseComparison> => {
  if (a.bins.length === 0 || b.bins.length === 0) {
    return err('INSUFFICIENT_INPUT', 'Both courses need resampled bins.');
  }

  const n = Math.min(a.bins.length, b.bins.length);
  const deltas: BinDelta[] = [];

  for (let i = 0; i < n; i += 1) {
    const binA = a.bins[i];
    const binB = b.bins[i];
    if (binA === undefined || binB === undefined) continue;

    deltas.push({
      distanceM: (binA.startM + binA.endM) / 2,
      gradeA: binA.grade,
      gradeB: binB.grade,
      deltaGrade: binB.grade - binA.grade,
      deltaDurationS:
        binA.durationS > 0 && binB.durationS > 0 ? binB.durationS - binA.durationS : undefined,
    });
  }

  return ok({
    a,
    b,
    sharedSegments: [],
    deltas,
    prov: provenance(
      [
        {
          id: 'course.compare',
          version: COURSE.version,
          calibration: 'provisional',
          params: { bins: n, binSizeM: COURSE.binSizeM },
          source: 'equal-distance binning',
        },
      ],
      computedAt,
    ),
  });
};

/**
 * NOTE ON PARSING (v1.1): GPX is XML (DOMParser in browser), FIT is a binary
 * format (needs a small decoder), TCX is XML. All of it should run client-side.
 * Deliberately not stubbed with a fake implementation, so nothing silently
 * returns empty results.
 */
export const parseActivity = (
  _input: ArrayBuffer | string,
  _format: ActivityFormat,
): Result<Activity> =>
  err(
    'OUT_OF_VALID_RANGE',
    'Activity parsing lands in v1.1. GPX/TCX via DOMParser, FIT via a binary decoder.',
  );
