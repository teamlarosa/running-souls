/**
 * gap.validation.test.ts — GAP calibration gate.
 *
 * Two independent layers of validation:
 *
 *  1. VALIDATION against the paper's own measured anchors. This is the real
 *     test: it asks whether our implementation is faithful to what Minetti
 *     actually measured in the lab, not whether it matches a competitor.
 *
 *  2. REFERENCE TABLE lock. Every value in gap-reference.csv is recomputed here
 *     from the polynomial, so the CSV cannot silently drift from the code.
 *
 * If either layer fails, the model must be demoted from `verified` back to
 * `provisional` in models/config.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  asGrade,
  asSecPerMetre,
  costOfRunning,
  costRatio,
  FLAT_COST,
  fromGap,
  gradeFromRiseRun,
  minimumCostGrade,
  toGap,
} from '../../src/index.js';

const NOW = '2026-01-01T00:00:00.000Z';
const G = (pct: number) => asGrade(pct / 100);

// ---------------------------------------------------------------------------
// Layer 1 — validation against Minetti et al. (2002) measured values.
//
// These are the paper's reported means +/- SD. Landing inside one SD is the
// bar: the polynomial was fitted to this same data, so it should not miss by
// more than the between-subject spread.
// ---------------------------------------------------------------------------

describe('Minetti measured anchors', () => {
  it('level running: C(0) = 3.60 vs measured 3.40 +/- 0.24', () => {
    const modelled = costOfRunning(asGrade(0));
    expect(modelled).toBeCloseTo(3.6, 6);
    expect(Math.abs(modelled - 3.4)).toBeLessThanOrEqual(0.24);
  });

  it('+45% uphill: C(0.45) = 19.43 vs measured 18.93 +/- 1.74', () => {
    const modelled = costOfRunning(G(45));
    expect(modelled).toBeCloseTo(19.426, 2);
    expect(Math.abs(modelled - 18.93)).toBeLessThanOrEqual(1.74);
  });

  it('minimum downhill: C(-0.20) = 1.80 vs measured 1.73 +/- 0.36', () => {
    const modelled = costOfRunning(G(-20));
    expect(modelled).toBeCloseTo(1.8, 2);
    expect(Math.abs(modelled - 1.73)).toBeLessThanOrEqual(0.36);
  });

  it('-45% downhill: C(-0.45) = 4.03 vs measured 3.92 +/- 0.81', () => {
    const modelled = costOfRunning(G(-45));
    expect(modelled).toBeCloseTo(4.032, 2);
    expect(Math.abs(modelled - 3.92)).toBeLessThanOrEqual(0.81);
  });

  it("reproduces the paper's qualitative findings", () => {
    // Steep downhill costs MORE than level running (eccentric braking).
    expect(costOfRunning(G(-45))).toBeGreaterThan(costOfRunning(G(0)));
    // Steep uphill is by far the most expensive.
    expect(costOfRunning(G(45))).toBeGreaterThan(costOfRunning(G(20)));
    // The cheapest grade is a descent, not flat.
    expect(costOfRunning(G(-18))).toBeLessThan(costOfRunning(G(0)));
  });

  it("puts the minimum close to -18%, per C'(i) = 0", () => {
    const min = minimumCostGrade() as number;
    expect(min).toBeGreaterThan(-0.19);
    expect(min).toBeLessThan(-0.17);
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — reference table lock. Matches gap-reference.csv exactly.
// ---------------------------------------------------------------------------

const REFERENCE: readonly { pct: number; ratio: number }[] = [
  { pct: -30, ratio: 0.68396 },
  { pct: -25, ratio: 0.56245 },
  { pct: -20, ratio: 0.50001 },
  { pct: -18, ratio: 0.49482 },
  { pct: -15, ratio: 0.51019 },
  { pct: -12, ratio: 0.55316 },
  { pct: -10, ratio: 0.5977 },
  { pct: -5, ratio: 0.76276 },
  { pct: 0, ratio: 1.0 },
  { pct: 5, ratio: 1.30144 },
  { pct: 10, ratio: 1.65784 },
  { pct: 15, ratio: 2.06028 },
  { pct: 20, ratio: 2.50186 },
  { pct: 25, ratio: 2.97922 },
  { pct: 30, ratio: 3.49425 },
];

describe('GAP reference table', () => {
  it('every row in gap-reference.csv is reproducible from the polynomial', () => {
    for (const row of REFERENCE) {
      expect(costRatio(G(row.pct))).toBeCloseTo(row.ratio, 4);
    }
  });

  it('flat grade is exactly 1.0 with no floating-point drift', () => {
    expect(costRatio(asGrade(0))).toBe(1);
    expect(FLAT_COST).toBe(3.6);
  });

  it('flat grade yields GAP identical to actual pace', () => {
    const pace = asSecPerMetre(300);
    const r = toGap(pace, asGrade(0), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gapSpm).toBe(pace);
  });

  it('reproduces the published worked example: 6:00/km at +10% -> 3:37/km', () => {
    // C(0.10) = 5.968214, ratio = 1.657837, 360 / 1.657837 = 217.1 s = 3:37
    const r = toGap(asSecPerMetre(360 / 1000), G(10), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.round(r.value.gapSpm * 1000)).toBe(217);
    expect(r.value.ratio).toBeCloseTo(1.65784, 4);
  });

  it('reproduces the downhill example: 4:00/km at -10% -> 6:41/km', () => {
    // C(-0.10) = 2.151706, ratio = 0.597696, 240 / 0.597696 = 401.5 s = 6:41
    const r = toGap(asSecPerMetre(240 / 1000), G(-10), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.round(r.value.gapSpm * 1000)).toBe(402);
    expect(r.value.ratio).toBeCloseTo(0.5977, 4);
  });

  it('locks the 8:00/mi and 6:00/km GAP columns', () => {
    const eightMinMileS = 480;
    const sixMinKmS = 360;

    // Spot-check the extremes and the minimum, where errors would be largest.
    const at30up = costRatio(G(30));
    expect(Math.round(eightMinMileS / at30up)).toBe(137); // 2:17
    expect(Math.round(sixMinKmS / at30up)).toBe(103); // 1:43

    const atMin = costRatio(G(-18));
    expect(Math.round(eightMinMileS / atMin)).toBe(970); // 16:10
    // 360 / 0.4948247 = 727.53 -> 728, i.e. 12:08
    expect(Math.round(sixMinKmS / atMin)).toBe(728);

    const at10up = costRatio(G(10));
    expect(Math.round(eightMinMileS / at10up)).toBe(290); // 4:50
    expect(Math.round(sixMinKmS / at10up)).toBe(217); // 3:37
  });
});

// ---------------------------------------------------------------------------
// Shape and monotonicity properties of the curve itself.
// ---------------------------------------------------------------------------

describe('cost curve shape', () => {
  it('is strictly increasing uphill', () => {
    let previous = costRatio(asGrade(0));
    for (let i = 1; i <= 45; i += 1) {
      const current = costRatio(G(i));
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('falls then rises downhill, with exactly one turning point', () => {
    let previous = costRatio(asGrade(0));
    let falls = 0;
    let rises = 0;

    for (let i = -1; i >= -45; i -= 1) {
      const current = costRatio(G(i));
      if (current < previous) falls += 1;
      else rises += 1;
      previous = current;
    }

    expect(falls).toBeGreaterThan(15);
    expect(rises).toBeGreaterThan(15);
    expect(falls + rises).toBe(45);
  });

  it('stays positive across the whole measured range', () => {
    for (let i = -45; i <= 45; i += 1) {
      expect(costOfRunning(G(i))).toBeGreaterThan(0);
    }
  });

  it('minimum ratio is about 0.4948, so downhill credit stays sane', () => {
    let min = Infinity;
    for (let i = -45; i <= 0; i += 1) min = Math.min(min, costRatio(G(i)));
    expect(min).toBeGreaterThan(0.48);
    expect(min).toBeLessThan(0.51);
  });
});

// ---------------------------------------------------------------------------
// Round-trip and warning behaviour.
// ---------------------------------------------------------------------------

describe('GAP round-trip and warnings', () => {
  it('fromGap inverts toGap exactly', () => {
    const pace = asSecPerMetre(0.32);
    for (const pct of [-25, -10, -3, 0, 4, 9, 17]) {
      const forward = toGap(pace, G(pct), NOW);
      expect(forward.ok).toBe(true);
      if (!forward.ok) continue;

      const back = fromGap(asSecPerMetre(forward.value.gapSpm), G(pct), NOW);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;

      expect(back.value.actualSpm).toBeCloseTo(pace, 12);
    }
  });

  it('clamps beyond the measured range and says so', () => {
    const r = toGap(asSecPerMetre(0.3), G(80), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.grade).toBe(0.45);
    expect(r.value.prov.warnings.length).toBeGreaterThan(0);
  });

  it('warns in the gait-transition zone', () => {
    const r = toGap(asSecPerMetre(0.3), G(18), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.prov.warnings.map((w) => w.code)).toContain('VALID_RANGE');
  });

  it('marks itself verified and cites Minetti', () => {
    const r = toGap(asSecPerMetre(0.3), G(5), NOW);
    if (!r.ok) return;
    const model = r.value.prov.models[0];
    expect(model?.calibration).toBe('verified');
    expect(model?.source).toContain('Minetti');
  });

  it('computes grade from rise over run', () => {
    expect(gradeFromRiseRun(50, 1000)).toBeCloseTo(0.05, 12);
    expect(gradeFromRiseRun(0, 1000)).toBe(0);
    expect(gradeFromRiseRun(10, 0)).toBe(0);
  });
});
