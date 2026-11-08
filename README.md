# Running Souls — Pace Calculator

A pace calculator built to the supplied mobile mockup, laid out desktop-first.
The calculation engine lives in `engine/` and is part of this same project.

---

## Project layout

```
index.html  package.json  vite.config.ts  tsconfig.json  netlify.toml
src/        the app (screens, styles, components)
engine/     the calculation engine: pure arithmetic, no UI
  src/        engine source
  test/       validation tests, including the GAP calibration table
```

The app imports the engine as `@running/engine`. The alias in `vite.config.ts`
points that name at `engine/src`, so the whole thing builds as one unit.

---

## Publishing

The site is a folder of static files (one HTML page, one JavaScript file, one CSS
file). There is no server and no database; every calculation runs in the visitor's
browser and nothing is uploaded.

Free path with no terminal: keep these files in a GitHub repository, and connect
that repository to Netlify. Netlify reads `netlify.toml`, builds the site, and
publishes it. Every change uploaded to GitHub republishes automatically.

---

## Running it locally (optional, needs Node.js)

```
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # reports type errors
npm test           # runs the engine's validation tests
```

`npm run build` deliberately does not run the type checker, so a stray type error
cannot block a deploy. Run `npm run typecheck` separately.

---

## Layout decision

The mockup is a phone screen. The calculator now carries splits, predictions,
conditions and provenance, so it is built desktop-first with the mockup as the
source of truth for phone:

- Wider than 1000px: two columns. Inputs stay put on the left; results scroll on
  the right.
- Narrower: one column in the mockup's order. Header, inputs, hero, training
  paces, then the added cards.

Same navy field, lime accent, teal hero and pastel icon badges throughout. Every
colour, radius and shadow is in `src/styles/tokens.css`.

---

## Deviations from the mockup

| Mockup | Built | Reason |
|---|---|---|
| `km` selected | `mi` selected, toggle present | Miles default, km on demand |
| Time and Pace both visible | Both visible; typing one clears the other | The engine needs exactly one of the two |
| "Calculate my pace" button | Live calculation, no button | It is local arithmetic; a button adds a click and no value |
| Three training zones | Same three, plus a five-zone table | Easy/Tempo/Interval match the mockup |
| No uncertainty | Every prediction shows ± | The differentiator |

---

## The three honesty rules the UI enforces

1. **GAP is effort, not pace.** At +10% grade the flat-equivalent figure is far
   faster than anyone can run. The conditions card says so beside the number.
2. **Heat is guidance.** Labelled as such; there is no peer-reviewed heat-pace
   formula and sources disagree on the threshold.
3. **Provisional means provisional.** Training-pace zone bands are tagged
   `read-only preview` until checked against Daniels' published table.

---

## Next

- Confirm training-pace zone bands against the published table.
- Garmin import produces a distance and a time, the same two values the
  calculator already consumes.
- Mobile app via Capacitor, wrapping this same built site.
