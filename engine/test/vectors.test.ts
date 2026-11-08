import { describe, expect, it } from 'vitest';

import {
  aggregate,
  asGrade,
  asSecPerMetre,
  computeVdot,
  costRatio,
  DEFAULT_UNIT_SYSTEM,
  evenSplits,
  fitCriticalSpeed,
  fitPersonalExponent,
  formatDuration,
  formatPace,
  METRES_PER_MILE,
  nearestStandard,
  paceBand,
  predictFromCriticalSpeed,
  predictRiegel,
  solvePace,
  timeForVdot,
  toGap,
} from '../src/index.js';

const NOW = '2026-01-01T00:00:00.000Z';

const D = (m: number) => m as never;
const T = (s: number) => s as never;
const G = (pct: number) => asGrade(pct / 100);

describe('pace vectors', () => {
  it('5 km in 20:00 = 240.00 s/km and 386.24256 s/mi', () => {
    const r = solvePace({ distance: D(5000), duration: T(1200) }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pace * 1000).toBeCloseTo(240, 9);
    expect(r.value.pace * METRES_PER_MILE).toBeCloseTo(386.24256, 4);
    expect(r.value.speed).toBeCloseTo(5000 / 1200, 12);
  });

  it('10 km in 45:00 = 270.00 s/km', () => {
    const r = solvePace({ distance: D(10000), duration: T(2700) }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pace * 1000).toBeCloseTo(270, 9);
  });

  it('half marathon in 1:30:00 = 255.955 s/km', () => {
    const r = solvePace({ distance: D(21097.5), duration: T(5400) }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pace * 1000).toBeCloseTo(255.955, 2);
  });

  it('marathon in 3:00:00 = 255.954 s/km and 411.94 s/mi', () => {
    const r = solvePace({ distance: D(42195), duration: T(10800) }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pace * 1000).toBeCloseTo(255.954, 2);
    expect(r.value.pace * METRES_PER_MILE).toBeCloseTo(411.94, 1);
  });

  it('the same marathon pace is not the same number in both units', () => {
    const r = solvePace({ distance: D(42195), duration: T(10800) }, NOW);
    if (!r.ok) return;
    const perKm = r.value.pace * 1000;
    const perMi = r.value.pace * METRES_PER_MILE;
    expect(perMi / perKm).toBeCloseTo(METRES_PER_MILE / 1000, 9);
  });
});

describe('Riegel vectors', () => {
  it('10 km in 45:00 predicts a half in about 1:39:17', () => {
    const r = predictRiegel({
      fromDistanceM: D(10000),
      fromTimeS: T(2700),
      toDistanceM: D(21097.5),
      computedAt: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seconds).toBeCloseTo(5957, 0);
    expect(formatDuration(r.value.seconds)).toBe('1:39:17');
  });

  it('10 km in 45:00 predicts a marathon in about 3:27', () => {
    const r = predictRiegel({
      fromDistanceM: D(10000),
      fromTimeS: T(2700),
      toDistanceM: D(42195),
      computedAt: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seconds).toBeGreaterThan(12414);
    expect(r.value.seconds).toBeLessThan(12426);
    expect(formatDuration(r.value.seconds)).toMatch(/^3:27:0\d$/);
  });

  it('carries a non-zero uncertainty band no wider than the worst case', () => {
    const r = predictRiegel({
      fromDistanceM: D(10000),
      fromTimeS: T(2700),
      toDistanceM: D(42195),
      computedAt: NOW,
    });
    if (!r.ok) return;
    expect(r.value.uncertaintyS).toBeGreaterThan(0);
    expect(r.value.uncertaintyS / r.value.seconds).toBeLessThanOrEqual(0.06);
  });

  it('a bigger k predicts a slower long race', () => {
    const slow = predictRiegel({
      fromDistanceM: D(5000), fromTimeS: T(1200), toDistanceM: D(42195),
      k: 1.1, computedAt: NOW,
    });
    const fast = predictRiegel({
      fromDistanceM: D(5000), fromTimeS: T(1200), toDistanceM: D(42195), computedAt: NOW,
    });
    expect(slow.ok && fast.ok).toBe(true);
    if (!slow.ok || !fast.ok) return;
    expect(slow.value.seconds).toBeGreaterThan(fast.value.seconds);
  });

  it('flags extrapolation beyond 4x the reference distance', () => {
    const r = predictRiegel({
      fromDistanceM: D(1609.344), fromTimeS: T(300), toDistanceM: D(42195), computedAt: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.prov.warnings.map((w) => w.code)).toContain('EXTRAPOLATION');
  });

  it('refuses a 10x distance jump outright', () => {
    const r = predictRiegel({
      fromDistanceM: D(400), fromTimeS: T(60), toDistanceM: D(100000), computedAt: NOW,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('OUT_OF_VALID_RANGE');
  });

  it('flags a stale reference result', () => {
    const r = predictRiegel({
      fromDistanceM: D(10000), fromTimeS: T(2700), toDistanceM: D(21097.5),
      resultAgeDays: 900, computedAt: NOW,
    });
    if (!r.ok) return;
    expect(r.value.prov.warnings.map((w) => w.code)).toContain('STALE_RESULT');
  });
});

describe('VDOT vectors', () => {
  it('5 km in 20:00 gives VDOT 49.81 (Daniels table: 49.8)', () => {
    const r = computeVdot(D(5000), T(1200), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.vdot).toBeCloseTo(49.81, 1);
    expect(r.value.raceVo2).toBeCloseTo(47.4645, 3);
  });

  it('inverting VDOT 49.81 at 5 km returns 20:00', () => {
    const r = timeForVdot(49.81, D(5000), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seconds).toBeCloseTo(1200, 0);
  });

  it('DOCUMENTS model behaviour: Daniels and Riegel AGREE closely on the marathon', () => {
    const daniels = timeForVdot(49.81, D(42195), NOW);
    const riegel = predictRiegel({
      fromDistanceM: D(5000), fromTimeS: T(1200), toDistanceM: D(42195), computedAt: NOW,
    });
    expect(daniels.ok && riegel.ok).toBe(true);
    if (!daniels.ok || !riegel.ok) return;
    expect(daniels.value.seconds).toBeGreaterThan(11400);
    expect(daniels.value.seconds).toBeLessThan(11560);
    expect(Math.abs(riegel.value.seconds - daniels.value.seconds)).toBeLessThan(120);
  });

  it('a 10K-derived VDOT also lands close to Riegel at the marathon', () => {
    const v = computeVdot(D(10000), T(2700), NOW);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.vdot).toBeCloseTo(45.26, 1);

    const daniels = timeForVdot(v.value.vdot, D(42195), NOW);
    const riegel = predictRiegel({
      fromDistanceM: D(10000), fromTimeS: T(2700), toDistanceM: D(42195), computedAt: NOW,
    });
    expect(daniels.ok && riegel.ok).toBe(true);
    if (!daniels.ok || !riegel.ok) return;
    expect(Math.abs(daniels.value.seconds - riegel.value.seconds)).toBeLessThan(180);
  });

  it('VDOT round-trips across standard distances', () => {
    for (const distance of [1500, 5000, 10000, 21097.5, 42195]) {
      const seeded = 50;
      const t = timeForVdot(seeded, D(distance), NOW);
      expect(t.ok).toBe(true);
      if (!t.ok) continue;
      const back = computeVdot(D(distance), T(t.value.seconds), NOW);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      expect(back.value.vdot).toBeCloseTo(seeded, 1);
    }
  });

  it('rejects a distance of zero', () => {
    expect(computeVdot(D(0), T(1200), NOW).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Grade. Exhaustive calibration lives in test/calibration/gap.validation.test.ts;
// these are the smoke vectors plus the shape properties that matter most.
// ---------------------------------------------------------------------------

describe('grade vectors (Minetti 2002)', () => {
  it('flat grade costs exactly 1.0x', () => {
    expect(costRatio(asGrade(0))).toBe(1);
  });

  it('+5% grade costs 1.30144x', () => {
    // C(0.05) = 4.68524, C(0) = 3.6
    expect(costRatio(G(5))).toBeCloseTo(1.30144, 5);
  });

  it('-10% grade costs 0.59770x', () => {
    // C(-0.10) = 2.15172
    expect(costRatio(G(-10))).toBeCloseTo(0.5977, 5);
  });

  it('uphill cost increases monotonically', () => {
    expect(costRatio(G(10))).toBeGreaterThan(costRatio(G(5)));
    expect(costRatio(G(20))).toBeGreaterThan(costRatio(G(10)));
    expect(costRatio(G(30))).toBeGreaterThan(costRatio(G(20)));
  });

  it('the cheapest grade is a descent near -20%, not flat', () => {
    const atFlat = costRatio(asGrade(0));
    const atMinus20 = costRatio(G(-20));
    expect(atMinus20).toBeCloseTo(0.50001, 5);
    expect(atMinus20).toBeLessThan(atFlat);
  });

  it('cost turns back UP below -20% because eccentric braking costs energy', () => {
    const at20 = costRatio(G(-20));
    const at25 = costRatio(G(-25));
    const at30 = costRatio(G(-30));
    expect(at25).toBeGreaterThan(at20);
    expect(at30).toBeGreaterThan(at25);
    // And steep descents are still cheaper than flat.
    expect(at30).toBeLessThan(costRatio(asGrade(0)));
  });

  it('GAP is faster than actual pace uphill, slower downhill', () => {
    const up = toGap(asSecPerMetre(0.3), G(5), NOW);
    const down = toGap(asSecPerMetre(0.3), G(-10), NOW);
    expect(up.ok && down.ok).toBe(true);
    if (!up.ok || !down.ok) return;
    expect(up.value.gapSpm).toBeLessThan(0.3);
    expect(down.value.gapSpm).toBeGreaterThan(0.3);
  });

  it('clamps absurd grades and warns', () => {
    const r = toGap(asSecPerMetre(0.3), G(80), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.prov.warnings.length).toBeGreaterThan(0);
  });
});

describe('split vectors', () => {
  it('marathon 3:00:00 in 1 km splits sums to exactly 10800 s', () => {
    const r = evenSplits(D(42195), T(10800), { unit: 'km', computedAt: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sum = r.value.splits.reduce((a, s) => a + s.splitSeconds, 0);
    expect(sum).toBe(10800);
    expect(r.value.splits).toHaveLength(43);
    expect(r.value.splits[42]?.distanceM).toBeCloseTo(195, 9);
  });

  it('every split is a whole number of seconds', () => {
    const r = evenSplits(D(21097.5), T(5957), { unit: 'mi', computedAt: NOW });
    if (!r.ok) return;
    for (const s of r.value.splits) {
      expect(Number.isInteger(s.splitSeconds)).toBe(true);
    }
    expect(r.value.splits.reduce((a, s) => a + s.splitSeconds, 0)).toBe(5957);
  });

  it('mile splits of a half marathon produce 14 rows', () => {
    const r = evenSplits(D(21097.5), T(5400), { unit: 'mi', computedAt: NOW });
    if (!r.ok) return;
    expect(r.value.splits).toHaveLength(14);
  });
});

describe('aggregation is total/total, never a mean of paces', () => {
  it('5 km at 5:00/km then 5 km at 6:00/km gives 5:30/km overall', () => {
    const r = aggregate(
      [{ distanceM: 5000, durationS: 1500 }, { distanceM: 5000, durationS: 1800 }],
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pace * 1000).toBeCloseTo(330, 9);
  });

  it('is not the arithmetic mean of paces at unequal distances', () => {
    const r = aggregate(
      [{ distanceM: 1000, durationS: 240 }, { distanceM: 9000, durationS: 4320 }],
      NOW,
    );
    if (!r.ok) return;
    expect(r.value.pace * 1000).toBeCloseTo(456, 6);
  });
});

describe('critical speed', () => {
  it('fits CS and D-prime from a 3 km and a 10 km', () => {
    const fit = fitCriticalSpeed(
      { distanceM: D(3000), timeS: T(540) },
      { distanceM: D(10000), timeS: T(2100) },
      NOW,
    );
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.value.criticalSpeed).toBeCloseTo(4.487179, 5);
    expect(fit.value.dPrime).toBeCloseTo(576.92, 1);

    const p = predictFromCriticalSpeed(fit.value, D(5000), NOW);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.seconds).toBeCloseTo(985.7, 0);
  });

  it('rejects two efforts that are too close in duration', () => {
    const fit = fitCriticalSpeed(
      { distanceM: D(5000), timeS: T(1200) },
      { distanceM: D(5200), timeS: T(1250) },
      NOW,
    );
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.code).toBe('CS_INPUTS_TOO_CLOSE');
  });

  it('warns when extrapolating well past 30 minutes', () => {
    const fit = fitCriticalSpeed(
      { distanceM: D(3000), timeS: T(540) },
      { distanceM: D(10000), timeS: T(2100) },
      NOW,
    );
    if (!fit.ok) return;
    const p = predictFromCriticalSpeed(fit.value, D(42195), NOW);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.prov.warnings.map((w) => w.code)).toContain('VALID_RANGE');
  });
});

describe('personal exponent fitting', () => {
  it('recovers a known k from three synthetic results', () => {
    const at = (d: number) => 0.14 * d ** 1.06;
    const results = [5000, 10000, 21097.5].map((d) => ({ distanceM: d, timeS: at(d) }));
    const fit = fitPersonalExponent(results, NOW);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.value.k).toBeCloseTo(1.06, 3);
    expect(fit.value.r2).toBeGreaterThan(0.999);
  });

  it('needs at least three results', () => {
    const fit = fitPersonalExponent(
      [{ distanceM: 5000, timeS: 1200 }, { distanceM: 10000, timeS: 2511 }],
      NOW,
    );
    expect(fit.ok).toBe(false);
  });

  it('rejects results that are all the same distance', () => {
    const fit = fitPersonalExponent(
      [
        { distanceM: 5000, timeS: 1200 },
        { distanceM: 5000, timeS: 1210 },
        { distanceM: 5000, timeS: 1195 },
      ],
      NOW,
    );
    expect(fit.ok).toBe(false);
  });
});

describe('pace bands', () => {
  it('even band splits the time in half', () => {
    const r = paceBand(D(42195), T(10800), { strategy: 'even', computedAt: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.firstHalfSeconds).toBeCloseTo(5400, 9);
    expect(r.value.secondHalfSeconds).toBeCloseTo(5400, 9);
  });

  it('negative split puts the slower half first', () => {
    const r = paceBand(D(42195), T(10800), {
      strategy: 'negative_split', secondHalfFactor: 0.99, computedAt: NOW,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.firstHalfSeconds).toBeGreaterThan(r.value.secondHalfSeconds);
    expect(r.value.firstHalfSeconds + r.value.secondHalfSeconds).toBeCloseTo(10800, 6);
  });

  it('rejects a nonsensical second-half factor', () => {
    const r = paceBand(D(42195), T(10800), {
      strategy: 'negative_split', secondHalfFactor: 1.5, computedAt: NOW,
    });
    expect(r.ok).toBe(false);
  });
});

describe('units and display defaults', () => {
  it('defaults to miles (decision 5)', () => {
    expect(DEFAULT_UNIT_SYSTEM).toBe('imperial');
  });

  it('formats pace with the right suffix', () => {
    expect(formatPace(386.24256, 'mi')).toBe('6:26 /mi');
    expect(formatPace(240, 'km')).toBe('4:00 /km');
  });

  it('rounds half away from zero', () => {
    expect(formatDuration(59.5)).toBe('1:00');
    expect(formatDuration(59.4)).toBe('0:59');
  });

  it('recognises a typed 26.2 mi as the marathon', () => {
    expect(nearestStandard(26.2 * METRES_PER_MILE)?.id).toBe('marathon');
  });

  it('keeps 1600 m distinct from a mile', () => {
    expect(nearestStandard(1600, 0.0001)?.id).toBe('1600m');
    expect(nearestStandard(1609.344, 0.0001)?.id).toBe('mile');
  });
});

describe('solver rejects malformed queries', () => {
  it('requires exactly two of three inputs', () => {
    expect(solvePace({ distance: D(5000) }, NOW).ok).toBe(false);
    expect(solvePace({}, NOW).ok).toBe(false);
    expect(
      solvePace({ distance: D(5000), duration: T(1200), pace: asSecPerMetre(0.24) }, NOW).ok,
    ).toBe(false);
  });
});
