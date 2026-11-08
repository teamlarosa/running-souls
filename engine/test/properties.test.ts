/**
 * properties.test.ts — property-based tests.
 *
 * These catch CLASSES of bug that example-based tests miss. A seeded LCG keeps
 * failures reproducible; the engine itself never uses Math.random.
 */

import { describe, expect, it } from 'vitest';

import {
  aggregate,
  asGrade,
  asSecPerMetre,
  costRatio,
  evenSplits,
  harmonicMeanSpeed,
  MAX_MPS,
  MIN_MPS,
  solvePace,
  toGap,
} from '../src/index.js';

const NOW = '2026-01-01T00:00:00.000Z';

/** Deterministic LCG — no Math.random, so failures reproduce exactly. */
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const dist = (r: () => number) => 100 + r() * 199900;
const time = (r: () => number, d: number) => {
  const v = MIN_MPS + r() * (MAX_MPS - MIN_MPS) * 0.7;
  return d / v;
};

describe('property: round-trip', () => {
  it('distance+duration -> pace -> duration recovers the input', () => {
    const r = makeRng(12345);
    for (let i = 0; i < 500; i += 1) {
      const d = dist(r);
      const t = time(r, d);
      const a = solvePace({ distance: d as never, duration: t as never }, NOW);
      if (!a.ok) continue;
      const b = solvePace({ distance: d as never, pace: a.value.pace }, NOW);
      expect(b.ok).toBe(true);
      if (!b.ok) continue;
      expect(Math.abs(b.value.duration - t) / t).toBeLessThan(1e-12);
    }
  });

  it('duration+pace -> distance -> pace recovers the input', () => {
    const r = makeRng(999);
    for (let i = 0; i < 300; i += 1) {
      const d = dist(r);
      const t = time(r, d);
      const a = solvePace({ duration: t as never, distance: d as never }, NOW);
      if (!a.ok) continue;
      const b = solvePace({ duration: t as never, pace: a.value.pace }, NOW);
      expect(b.ok).toBe(true);
      if (!b.ok) continue;
      expect(Math.abs(b.value.distance - d) / d).toBeLessThan(1e-12);
    }
  });
});

describe('property: monotonicity', () => {
  it('a longer time over the same distance is always a slower pace', () => {
    const r = makeRng(4242);
    for (let i = 0; i < 200; i += 1) {
      const d = dist(r);
      const t = time(r, d);
      const slower = t * (1 + 0.01 + r() * 0.5);
      const a = solvePace({ distance: d as never, duration: t as never }, NOW);
      const b = solvePace({ distance: d as never, duration: slower as never }, NOW);
      if (!a.ok || !b.ok) continue;
      expect(b.value.pace).toBeGreaterThan(a.value.pace);
    }
  });
});

describe('property: no NaN or Infinity escapes', () => {
  it('every input yields either a finite result or a typed error', () => {
    const r = makeRng(777);
    for (let i = 0; i < 1000; i += 1) {
      const d = dist(r);
      const t = time(r, d);
      const res = solvePace({ distance: d as never, duration: t as never }, NOW);
      if (res.ok) {
        expect(Number.isFinite(res.value.pace)).toBe(true);
        expect(Number.isFinite(res.value.speed)).toBe(true);
        expect(Number.isFinite(res.value.duration)).toBe(true);
        expect(res.value.pace).toBeGreaterThan(0);
      } else {
        expect(typeof res.code).toBe('string');
        expect(res.code.length).toBeGreaterThan(0);
      }
    }
  });

  it('rejects zero, negative and non-finite inputs', () => {
    expect(solvePace({ distance: 0 as never, duration: 100 as never }, NOW).ok).toBe(false);
    expect(solvePace({ distance: -5 as never, duration: 100 as never }, NOW).ok).toBe(false);
    expect(solvePace({ distance: NaN as never, duration: 100 as never }, NOW).ok).toBe(false);
    expect(solvePace({ distance: 5000 as never, duration: Infinity as never }, NOW).ok).toBe(false);
  });

  it('rejects impossible speeds with SPEED_OUT_OF_RANGE', () => {
    const tooFast = solvePace({ distance: 100 as never, duration: 1 as never }, NOW);
    expect(tooFast.ok).toBe(false);
    if (tooFast.ok) return;
    expect(tooFast.code).toBe('SPEED_OUT_OF_RANGE');

    const tooSlow = solvePace({ distance: 100 as never, duration: 10000 as never }, NOW);
    expect(tooSlow.ok).toBe(false);
  });
});

describe('property: GAP direction', () => {
  it('uphill always gives a faster GAP; gentle downhill always slower', () => {
    const r = makeRng(31337);
    for (let i = 0; i < 300; i += 1) {
      const spm = asSecPerMetre(0.2 + r() * 0.4);

      const upGrade = r() * 0.3;
      const up = toGap(spm, asGrade(upGrade), NOW);
      expect(up.ok).toBe(true);
      if (up.ok) expect(up.value.gapSpm).toBeLessThan(spm);

      // Down to -15% the model only ever gives credit.
      const downGrade = -(r() * 0.15);
      const down = toGap(spm, asGrade(downGrade), NOW);
      expect(down.ok).toBe(true);
      if (down.ok) expect(down.value.gapSpm).toBeGreaterThan(spm);
    }
  });

  it('the cost curve is continuous, with no kinks anywhere', () => {
    // The polynomial is smooth by construction. This guards against anyone
    // reintroducing a piecewise model without checking the join points.
    const h = 1e-7;
    for (let pct = -40; pct <= 40; pct += 4) {
      const g = pct / 100;
      const left = (costRatio(asGrade(g - h)) - costRatio(asGrade(g))) / h;
      const right = (costRatio(asGrade(g + h)) - costRatio(asGrade(g))) / h;
      expect(Math.abs(left - right)).toBeLessThan(1e-3);
    }
  });

  it('GAP is always finite and positive across the measured range', () => {
    const r = makeRng(5150);
    for (let i = 0; i < 300; i += 1) {
      const spm = asSecPerMetre(0.15 + r() * 0.6);
      const pct = -45 + r() * 90;
      const res = toGap(spm, asGrade(pct / 100), NOW);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(Number.isFinite(res.value.gapSpm)).toBe(true);
      expect(res.value.gapSpm).toBeGreaterThan(0);
      expect(res.value.ratio).toBeGreaterThan(0);
    }
  });
});

describe('property: split invariant', () => {
  it('splits always sum to the total, in whole seconds', () => {
    const r = makeRng(2024);
    for (let i = 0; i < 200; i += 1) {
      const d = 400 + r() * 200000;
      const t = Math.round(time(r, d));
      const res = evenSplits(d as never, t as never, { unit: 'km', computedAt: NOW });
      if (!res.ok) continue;
      const sum = res.value.splits.reduce((a, s) => a + s.splitSeconds, 0);
      expect(sum).toBe(t);
      for (const s of res.value.splits) {
        expect(Number.isInteger(s.splitSeconds)).toBe(true);
        expect(s.splitSeconds).toBeGreaterThan(0);
      }
    }
  });
});

describe('property: aggregation identity', () => {
  it('aggregate equals total time divided by total distance', () => {
    const r = makeRng(8080);
    for (let i = 0; i < 100; i += 1) {
      const segs = Array.from({ length: 1 + Math.floor(r() * 8) }, () => ({
        distanceM: 200 + r() * 5000,
        durationS: 60 + r() * 2000,
      }));
      const res = aggregate(segs, NOW);
      if (!res.ok) continue;
      const totalM = segs.reduce((a, s) => a + s.distanceM, 0);
      const totalS = segs.reduce((a, s) => a + s.durationS, 0);
      expect(res.value.pace).toBeCloseTo(totalS / totalM, 12);
    }
  });

  it('harmonic mean of speeds beats arithmetic mean of paces', () => {
    // 4:00/km and 6:00/km for equal distances -> 4:48/km overall.
    const v1 = 1000 / 240;
    const v2 = 1000 / 360;
    const overallPace = 1 / harmonicMeanSpeed([v1, v2]);
    expect(overallPace * 1000).toBeCloseTo(288, 6);
    // The wrong answer (mean of paces) would be 300 s/km.
    expect(overallPace * 1000).not.toBeCloseTo(300, 0);
  });
});
