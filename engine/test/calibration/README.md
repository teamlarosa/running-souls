# GAP reference table

Generated from the Minetti et al. (2002) running energy-cost polynomial:

```
C(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6     J·kg⁻¹·m⁻¹
ratio = C(i) / C(0),  C(0) = 3.6
GAP   = actual pace / ratio
```

Every row is locked by `test/calibration/gap.validation.test.ts`, which
recomputes each ratio from the polynomial. The CSV cannot drift from the code
without a test failing.

## Why this table exists

There is no authoritative published GAP table to check against. Published
third-party charts disagree with each other, and several are derived from the
corrupted coefficient set (`…, −32.8, +43.7, 53.3, 156.46`) which produces a
cost curve that barely responds to grade. Calibrating against those would have
been calibrating against a bug.

So validation is anchored to the paper's own measured values instead — a
stronger test, because it asks whether the implementation is faithful to the
physics rather than whether it matches a competitor.

## Validation points (Minetti 2002, measured means ± SD)

| Condition | Measured | Polynomial | Within 1 SD |
|---|---|---|---|
| Level running | 3.40 ± 0.24 | **3.60** | ✓ |
| +45% uphill | 18.93 ± 1.74 | **19.43** | ✓ |
| Minimum downhill (~−20%) | 1.73 ± 0.36 | **1.80** | ✓ |
| −45% downhill | 3.92 ± 0.81 | **4.03** | ✓ |

All four anchors land inside one standard deviation. The polynomial sits near the
top of the SD band at flat ground (3.60 vs 3.40), which is the known trade-off
from fitting one curve across the full ±45% range.

## Reading the table

`gap_for_8_00_mi` and `gap_for_6_00_km` show what a given *actual* pace is worth
as flat-equivalent effort. Uphill runs earn a faster GAP; downhill runs earn a
slower one.

Two results worth understanding before you ship anything that displays GAP:

**−20% is the cheapest grade, not flat.** The curve is U-shaped: gentle descents
cost less than level running because gravity assists more than eccentric braking
costs. At −20% the ratio bottoms out at 0.500 — meaning a 4:00/km descent is
worth 8:00/km of flat effort.

**Steep descents get *more* expensive again.** Below about −20% the ratio climbs,
because braking costs energy. This is the detail most naively-built calculators
miss entirely, and it is why "downhill is free" intuition is wrong.

**Uphill credit is large.** At +10% the ratio is 1.658, so 6:00/km uphill is
6:00 ÷ 1.658 = 3:37/km flat-equivalent. That number looks absurd if you read it
as "a pace I could run" — it is not. It is an *effort* equivalence. Any UI that
shows GAP next to actual pace needs to make that distinction explicit, or users
will reasonably think the app is broken.

## Caveats the UI must carry

- **±30% is where the polynomial is well-behaved.** Rows at ±30% are marked
  accordingly; beyond that the model is clamped and warns.
- **Above ~+15%, most people walk.** The polynomial assumes running throughout,
  so GAP in that range is a *relative* comparison between two routes, not a
  claim about achievable pace.
- **Surface is not modelled.** Rock, sand, mud and technical trail all cost more
  than the treadmill curve predicts.
- **Individual variation is real.** Some runners are relatively better uphill,
  others downhill. The curve is a population average.
- **This is not Strava's curve.** Strava replaced Minetti with a heart-rate-fitted
  model in 2017, which gives less credit on descents and turns back up at a
  shallower grade. Expect differences on steep downhills; they are not bugs.

## Citation

Minetti, A.E., Moia, C., Roi, G.S., Susta, D., Ferretti, G. (2002). Energy cost
of walking and running at extreme uphill and downhill slopes. *Journal of
Applied Physiology* 93, 1039–1046.
