/**
 * distances.ts — standard race distances as EXACT metres.
 *
 * Note 1600m is NOT a mile (1609.344). Conflating them is a 0.58% error:
 * invisible on a 5K, 59 seconds on a marathon.
 */

import { asMetres, type Metres } from './units.js';

export type DistanceId =
  | '400m' | '600m' | '800m' | '1000m' | '1500m' | '1600m'
  | 'mile' | '2000m' | '3000m' | '3200m' | '2mi'
  | '4000m' | '3mi' | '5000m' | '6000m' | '4mi'
  | '8000m' | '5mi' | '10000m' | '12km' | '15km'
  | '10mi' | '20km' | 'half_marathon' | '15mi' | '25km'
  | '30km' | '20mi' | 'marathon' | '50km' | '50mi'
  | '100km' | '100mi';

export interface StandardDistance {
  readonly id: DistanceId;
  readonly m: Metres;
  /** Display name. */
  readonly name: string;
  /** Short label for compact UI. */
  readonly short: string;
}

/** Exact metre definitions. Mile-derived entries use 1609.344 exactly. */
export const DISTANCES: Readonly<Record<DistanceId, StandardDistance>> = {
  '400m':  { id: '400m',  m: asMetres(400),      name: '400 m',        short: '400m' },
  '600m':  { id: '600m',  m: asMetres(600),      name: '600 m',        short: '600m' },
  '800m':  { id: '800m',  m: asMetres(800),      name: '800 m',        short: '800m' },
  '1000m': { id: '1000m', m: asMetres(1000),     name: '1000 m',       short: '1K' },
  '1500m': { id: '1500m', m: asMetres(1500),     name: '1500 m',       short: '1500m' },
  '1600m': { id: '1600m', m: asMetres(1600),     name: '1600 m',       short: '1600m' },
  mile:    { id: 'mile',  m: asMetres(1609.344), name: '1 mile',       short: '1mi' },
  '2000m': { id: '2000m', m: asMetres(2000),     name: '2000 m',       short: '2K' },
  '3000m': { id: '3000m', m: asMetres(3000),     name: '3000 m',       short: '3K' },
  '3200m': { id: '3200m', m: asMetres(3200),     name: '3200 m',       short: '3200m' },
  '2mi':   { id: '2mi',   m: asMetres(3218.688), name: '2 miles',      short: '2mi' },
  '4000m': { id: '4000m', m: asMetres(4000),     name: '4000 m',       short: '4K' },
  '3mi':   { id: '3mi',   m: asMetres(4828.032), name: '3 miles',      short: '3mi' },
  '5000m': { id: '5000m', m: asMetres(5000),     name: '5 km',         short: '5K' },
  '6000m': { id: '6000m', m: asMetres(6000),     name: '6000 m',       short: '6K' },
  '4mi':   { id: '4mi',   m: asMetres(6437.376), name: '4 miles',      short: '4mi' },
  '8000m': { id: '8000m', m: asMetres(8000),     name: '8000 m',       short: '8K' },
  '5mi':   { id: '5mi',   m: asMetres(8046.72),  name: '5 miles',      short: '5mi' },
  '10000m':{ id: '10000m',m: asMetres(10000),    name: '10 km',        short: '10K' },
  '12km':  { id: '12km',  m: asMetres(12000),    name: '12 km',        short: '12K' },
  '15km':  { id: '15km',  m: asMetres(15000),    name: '15 km',        short: '15K' },
  '10mi':  { id: '10mi',  m: asMetres(16093.44), name: '10 miles',     short: '10mi' },
  '20km':  { id: '20km',  m: asMetres(20000),    name: '20 km',        short: '20K' },
  half_marathon: { id: 'half_marathon', m: asMetres(21097.5), name: 'Half marathon', short: 'HM' },
  '15mi':  { id: '15mi',  m: asMetres(24140.16), name: '15 miles',     short: '15mi' },
  '25km':  { id: '25km',  m: asMetres(25000),    name: '25 km',        short: '25K' },
  '30km':  { id: '30km',  m: asMetres(30000),    name: '30 km',        short: '30K' },
  '20mi':  { id: '20mi',  m: asMetres(32186.88), name: '20 miles',     short: '20mi' },
  marathon: { id: 'marathon', m: asMetres(42195), name: 'Marathon',    short: 'Mar' },
  '50km':  { id: '50km',  m: asMetres(50000),    name: '50 km',        short: '50K' },
  '50mi':  { id: '50mi',  m: asMetres(80467.2),  name: '50 miles',     short: '50mi' },
  '100km': { id: '100km', m: asMetres(100000),   name: '100 km',       short: '100K' },
  '100mi': { id: '100mi', m: asMetres(160934.4), name: '100 miles',    short: '100mi' },
};

export const distanceById = (id: DistanceId): StandardDistance => DISTANCES[id];

/**
 * Resolve an arbitrary distance to the nearest standard distance, within
 * a relative tolerance. Used to recognise "26.2 mi" as the marathon.
 */
export const nearestStandard = (
  m: number,
  relTolerance = 0.002,
): StandardDistance | undefined => {
  let best: StandardDistance | undefined;
  let bestDelta = Infinity;
  for (const d of Object.values(DISTANCES)) {
    const delta = Math.abs(d.m - m) / d.m;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = d;
    }
  }
  return best && bestDelta <= relTolerance ? best : undefined;
};

/** Display-ordered subset for the calculator's distance picker. */
export const PICKER_ORDER: readonly DistanceId[] = [
  '400m', '800m', '1500m', 'mile', '3000m', '2mi', '5000m', '5mi',
  '10000m', '10mi', 'half_marathon', 'marathon', '50km', '50mi', '100km', '100mi',
];
