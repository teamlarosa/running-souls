# @running/engine

Pure calculation engine for a running app. Pace, splits, race prediction,
training paces, and condition adjustments (grade, heat, altitude).

**Zero runtime dependencies.** No UI, no network, no clock, no randomness.

---

## Why this exists in this shape

Every number the product shows is a claim. This package exists so those claims
are **computable, testable and auditable** — and so the same arithmetic can back
a web app, a mobile shell, a desktop build and a server without being written
twice.

Two consequences worth internalising:

1. **Every result carries provenance.** Which models ran, at which version, with
   which parameters, from which paper, and what warnings apply. When a user says
   "this disagrees with McMillan," provenance is the answer.
2. **The engine is deterministic.** Callers pass `computedAt`; the engine never
   reads the clock. Identical inputs always give byte-identical output.

---

## Design rules

| # | Rule | Reason |
|---|---|---|
| 1 | All computation is pure and dependency-free | Testable, portable to every target |
| 2 | Canonical units: **metres** and **seconds**, float64 | One representation, no unit bugs |
| 3 | Unit conversion only at input/display boundaries | Prevents drift |
| 4 | No UI, network, `Date.now()`, `Math.random()` | Deterministic, reproducible |
| 5 | Every result carries `Provenance` | Reproducibility is the position |
| 6 | Constants live only in `models/config.ts`, with citations | Audit + swappable methodology |
| 7 | Aggregate pace = total seconds / total metres | Averaging paces is mathematically wrong |

Rule 7 is not fussiness. Pace is a reciprocal, so the mean of 5:00 and 6:00 pace
is not the mean of the two speeds. `aggregate()` exists so callers cannot get
this wrong.

---

## Install and test

```bash
npm install
npm test            # validation harness — the important artefact
npm run typecheck
npm run build
```

---

## Usage

=== CODE ===

```ts
import {
  solvePace, formatPace, toDisplayPace, DEFAULT_UNIT_SYSTEM,
  asMetres, asSeconds,
} from '@running/engine';

const now = new Date().toISOString();   // caller supplies the clock

const result = solvePace(
  { distance: asMetres(5000), duration: asSeconds(1200) },
  now,
);

if (result.ok) {
  const sys = DEFAULT_UNIT_SYSTEM;                       // 'imperial'
  console.log(formatPace(toDisplayPace(result.value.pace, sys), 'mi'));  // "6:26 /mi"
}
```

=== CODE ===

```ts
import { parseDistance, parseDuration, parsePace } from '@running/engine';

const d = parseDistance('26.2 mi');
const t = parseDuration('3:00');        // two fields = mm:ss
const p = parsePace('6:52/mi');
```

Parsing returns typed errors with character offsets, never coerced guesses. A
bare `"45"` is rejected as ambiguous rather than silently read as 45 minutes.

---

## Modules

### PAC — pace (`src/pace.ts`)
Solve any one unknown from the other two. Validates against a human-plausible
speed window (0.5–12 m/s) so unit mistakes surface as errors, not nonsense.

### SPLIT — splits and bands (`src/split.ts`)
Even splits use **cumulative rounding then differencing**, which guarantees
`sum(splits) === total` exactly, in whole seconds. Naive per-split rounding drifts
by up to ±0.5 s per row. Pace bands support `even` and `negative_split`, with the
second-half factor as an explicit parameter rather than a magic number.

### PRED — race prediction (`src/modules/`)

| Model | Source | Notes |
|---|---|---|
| `riegel` | Riegel 1981 | v1 default, k=1.06 |
| `criticalspeed` | Monod & Scherrer 1965 | strongest physiologically; 2–30 min range |
| `vdot` | Daniels & Gilbert 1979 | reproduces published tables |
| `fitPersonalExponent` | least squares | fits the athlete's own k from their history |

**On model agreement.** I checked this numerically rather than assuming it. From
a 20:00 5K, Riegel predicts 3:11:51 for a marathon and Daniels predicts 3:11:15 —
they agree within about a minute. From a 45:00 10K both land near 3:27. The wide
divergences people see between commercial calculators come from different `k`
choices and proprietary blends, **not** from these two published models
contradicting each other. A test asserts this agreement so nobody "corrects" one
model to match the other.

`fitPersonalExponent` is the differentiator: with three or more results it fits
that athlete's own endurance exponent by recency-weighted least squares in
log-log space. A two-parameter regression, not machine learning — and it is
individual, which no incumbent really offers.

### TPACE — training paces (`src/modules/tpace.ts`)
Pluggable strategies: `daniels_vdot`, `critical_speed`, `goal_deltas`. The
`consensus()` view reports, per zone, the **union** of all strategies, the
**intersection** where they genuinely agree, the spread, and an agreement rating.
Where strategies converge the number is trustworthy; where they diverge, showing
that is the honest answer. **v1 is read-only** by decision — the shapes are final.

### COND — grade (`src/modules/grade.ts`) — now calibrated

Uses the **Minetti et al. (2002)** running energy-cost polynomial directly:

```
C(i) = 155.4·i⁵ − 30.4·i⁴ − 43.3·i³ + 46.3·i² + 19.5·i + 3.6    J·kg⁻¹·m⁻¹
ratio = C(i) / C(0),  C(0) = 3.6
GAP   = actual pace / ratio
```

⚠️ **A corrupted variant circulates widely:** `(…, −32.8, +43.7, 53.3, 156.46)`.
The tell is the constant term. Minetti measured level running at 3.40 ± 0.24 J/kg/m,
so a constant near 156 is off by a factor of ~43 and yields a curve that barely
responds to grade — it implies only ~1.8% extra energy at +5% where the real curve
gives ~30%. I initially had this variant in the spec and replaced it.

**Validation** (`test/calibration/gap.validation.test.ts`) is anchored to the
paper's own measured values, not to a competitor's chart:

| Condition | Measured | Polynomial | Within 1 SD |
|---|---|---|---|
| Level running | 3.40 ± 0.24 | 3.60 | ✓ |
| +45% uphill | 18.93 ± 1.74 | 19.43 | ✓ |
| Minimum downhill | 1.73 ± 0.36 | 1.78 | ✓ |
| −45% downhill | 3.92 ± 0.81 | 4.03 | ✓ |

The reference table is in `test/calibration/gap-reference.csv`, with
`test/calibration/README.md` explaining how to read it.

Three results the UI must not misrepresent:

- **The cheapest grade is about −18%, not flat.** The curve is U-shaped; gentle
  descents cost less than level running (ratio bottoms out at 0.4948).
- **Steep descents get more expensive again** — eccentric braking costs energy.
  Most naively-built calculators miss this entirely.
- **Uphill credit looks absurd if read as pace.** At +10%, 6:00/km is worth
  3:37/km flat-equivalent. That is an *effort* equivalence, not a runnable pace.
  Any UI showing GAP beside actual pace must say so explicitly.

**Known divergence:** Strava replaced Minetti with a heart-rate-fitted curve in
2017, giving less credit on descents and rebounding at a shallower grade.
Differences on steep downhills are expected, not bugs.

### COND — heat (`src/modules/heat.ts`)
Labelled `heuristic`, because there is no peer-reviewed formula — these are coach
rules of thumb and sources disagree on the threshold. Both schools are exposed
(`sum_f_130` default, `sum_f_100` conservative). The penalty scales with duration,
so a 5K in heat costs far less than a marathon in the same heat. Acclimation is
modelled as a reduction, not a switch.

### COND — altitude (`src/modules/altitude.ts`)
Wehrlin & Hallén (2006): ~6.3% VO₂max decline per 1000 m above threshold.
Performance declines faster than VO₂max, so the penalty is amplified. Includes
duration dependence and the counter-intuitive **arrival-timing** effect: arriving
the day before a race is worse than not travelling.

---

## Provenance

=== CODE ===

```ts
result.value.prov
// {
//   engineVersion: '0.1.0',
//   models: [{ id: 'grade.minetti', version: '2.0.0', calibration: 'verified',
//              params: { c5: 155.4, ..., c0: 3.6 },
//              source: 'grade: Minetti, A.E., Moia, C., ... (2002)...' }],
//   computedAt: '2026-01-01T00:00:00.000Z',
//   warnings: [{ code: 'VALID_RANGE', message: '...' }]
// }
```

`calibration` is `verified`, `provisional` or `heuristic`. The UI must render
`heuristic` models as guidance and never as prediction — a design requirement,
not a nicety.

---

## Calibration status

| Model | Status | Remaining gate |
|---|---|---|
| `pace` | verified | — |
| `split` | verified | — |
| `riegel` | verified | — |
| `vdot` | verified | — |
| `criticalSpeed` | verified | — |
| `grade` | **verified** | Closed — see test/calibration/ |
| `heat` | heuristic | By nature; labelled in UI |
| `altitude` | provisional | No reference table yet |
| `course` | provisional | Awaits GPX parsing |

Remaining work: `tpace` zone bounds need confirming against Daniels' *Running
Formula* 4th ed. Table 4.1 with a page citation. Cameron / Peronnet–Thibault
coefficients are still deliberately unimplemented — several secondary sources
give mutually inconsistent formulations, so they need primary papers first.

---

## Not implemented, deliberately

`parseActivity()` returns an error rather than a fake empty result. GPX/TCX go
through `DOMParser`; FIT needs a binary decoder. All client-side, no upload.

Course comparison shapes (`Bin`, `CourseSummary`, `compare`) are defined and
bin-by-bin comparison works. **Shared-segment alignment via corridor matching or
Fréchet distance is v2** — the genuinely hard algorithmic work.

---

## Repo layout

```
src/
  units.ts        constants, branded types, conversions
  errors.ts       typed failures
  provenance.ts   ModelRef, Warning, Provenance
  distances.ts    standard distances as exact metres
  parse.ts        input grammar
  format.ts       display formatting (the ONLY place rounding happens)
  pace.ts         core solver + aggregation
  split.ts        splits, pace bands
  course.ts       GPS import shapes, binning, elevation
  models/config.ts   ALL constants with citations
  modules/        riegel, vdot, criticalspeed, grade, heat, altitude, tpace
test/
  vectors.test.ts              reference vectors
  properties.test.ts           property-based invariants
  calibration/
    gap.validation.test.ts     Minetti anchors + table lock
    gap-reference.csv          the locked table
    README.md                  how to read it, and the caveats
```

---

## Attribution

Formulas are not copyrightable; complete published **tables** are, as is prose.
We compute from equations and cite the papers. Never transcribe a book's tables.

- Riegel, P.S. (1981). *American Scientist* 69(3), 285–290.
- Daniels, J. & Gilbert, J. (1979). *Oxygen Power.* ; Daniels, J. (2014).
  *Daniels' Running Formula*, 4th ed.
- Monod, H. & Scherrer, J. (1965). *Ergonomics* 8(3), 329–338.
- Minetti, A.E., Moia, C., Roi, G.S., Susta, D., Ferretti, G. (2002). *J Appl
  Physiol* 93, 1039–1046.
- Wehrlin, J.P. & Hallén, J. (2006). *Eur J Appl Physiol* 98, 437–445.

A "How we calculate this" page should ship as a visible product feature, backed
by `SOURCES` in `models/config.ts`.
