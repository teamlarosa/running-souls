/**
 * ConditionsCard.tsx — the impact of grade, heat and altitude.
 *
 * Rendered only in the results column, and only for conditions the user
 * switched on. Cause lives in the input panel; effect lives here.
 *
 * Honesty rules this component enforces, all traceable to engine provenance:
 *   - Heat is a HEURISTIC. Labelled as guidance, never as prediction.
 *   - GAP is an EFFORT equivalence, not a runnable pace. At +10%, the
 *     flat-equivalent number is far faster than anyone can actually run.
 *   - Combined modifiers are not independent, so a large stack widens the range
 *     rather than pretending precision.
 */

import { useMemo } from 'react';
import {
  adjustForAltitude,
  adjustForHeat,
  asGrade,
  combineModifiers,
  fromGap,
  type SecPerMetre,
} from '@running/engine';
import { Card, Disclosure, Notice, Tag } from '../components/Ui';
import type { Calculator } from '../state';
import { paceClock, paceToDisplay, signedPercent, unitLabel } from '../format';

interface ConditionRow {
  key: 'grade' | 'heat' | 'altitude';
  label: string;
  multiplier: number;
  adjustedSpm: number;
  note?: string;
  heuristic?: boolean;
}

export function ConditionsCard({ calc }: { calc: Calculator }) {
  const { state, derived, computedAt } = calc;
  const unit = unitLabel(state.unit);
  const conditions = state.conditions;

  const anyOn = conditions.gradeOn || conditions.heatOn || conditions.altitudeOn;

  const model = useMemo(() => {
    if (!anyOn) return null;
    if (derived.spm === null || derived.seconds === null) return null;

    const base: SecPerMetre = derived.spm;
    const durationS = derived.seconds;
    const rows: ConditionRow[] = [];

    // ---- Grade ----------------------------------------------------------
    if (conditions.gradeOn) {
      const pctValue = Number(conditions.gradePct.replace(',', '.'));
      if (Number.isFinite(pctValue)) {
        const result = fromGap(base, asGrade(pctValue / 100), computedAt);
        if (result.ok) {
          rows.push({
            key: 'grade',
            label: `Grade ${pctValue > 0 ? '+' : ''}${pctValue}%`,
            multiplier: result.value.ratio,
            adjustedSpm: result.value.actualSpm,
            note:
              result.value.ratio > 1
                ? 'uphill costs more time per unit distance'
                : 'descent gives time back, up to the optimum',
          });
        }
      }
    }

    // ---- Heat -----------------------------------------------------------
    if (conditions.heatOn) {
      const tempF = Number(conditions.tempF.replace(',', '.'));
      const dewPointF = Number(conditions.dewPointF.replace(',', '.'));
      if (Number.isFinite(tempF) && Number.isFinite(dewPointF)) {
        const result = adjustForHeat({
          paceSpm: base,
          durationS,
          tempF,
          dewPointF,
          computedAt,
        });
        if (result.ok) {
          rows.push({
            key: 'heat',
            label: `Heat ${tempF}°F / dew ${dewPointF}°F`,
            multiplier: result.value.multiplier,
            adjustedSpm: result.value.adjustedSpm,
            note: `sum ${Math.round(result.value.sumF)}°F`,
            heuristic: true,
          });
        }
      }
    }

    // ---- Altitude -------------------------------------------------------
    if (conditions.altitudeOn) {
      const elevationM = Number(conditions.elevationM.replace(',', '.'));
      if (Number.isFinite(elevationM)) {
        const result = adjustForAltitude({
          paceSpm: base,
          durationS,
          elevationM,
          computedAt,
        });
        if (result.ok) {
          rows.push({
            key: 'altitude',
            label: `Altitude ${Math.round(elevationM)} m`,
            multiplier: result.value.multiplier,
            adjustedSpm: result.value.adjustedSpm,
            note: `${signedPercent(-result.value.vo2DeclineFraction)} VO₂ capacity`,
          });
        }
      }
    }

    if (rows.length === 0) return null;

    const multiplierOf = (key: ConditionRow['key']): number | undefined =>
      rows.find((row) => row.key === key)?.multiplier;

    const combined = combineModifiers(
      {
        heat: multiplierOf('heat'),
        altitude: multiplierOf('altitude'),
        grade: multiplierOf('grade'),
      },
      computedAt,
    );

    return {
      rows,
      combined,
      base,
      combinedSpm: base * combined.combined,
      combinedDeltaSeconds: durationS * (combined.combined - 1),
    } as const;
  }, [anyOn, conditions, derived.spm, derived.seconds, computedAt]);

  if (!anyOn) return null;

  if (model === null) {
    return (
      <Card title="Conditions">
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Enter a distance and a time to see how conditions change the numbers.
        </p>
      </Card>
    );
  }

  const hasHeuristic = model.rows.some((row) => row.heuristic);
  const hasGrade = model.rows.some((row) => row.key === 'grade');
  const combinedWarning = model.combined.prov.warnings.find(
    (warning) => warning.code === 'COMBINED_UNCERTAINTY_HIGH',
  );
  const showsCombined = model.rows.length > 1;

  return (
    <Card
      title="Conditions"
      aside={
        hasHeuristic ? (
          <Tag tone="heuristic">partly guidance</Tag>
        ) : (
          <Tag tone="verified">modelled</Tag>
        )
      }
    >
      <div className="cond-list">
        {model.rows.map((row) => (
          <div className="condrow" key={row.key}>
            <div className="condrow__main">
              <span className="condrow__label">{row.label}</span>
              {row.note ? <span className="condrow__note">{row.note}</span> : null}
            </div>
            <div className="condrow__numbers">
              <span className="condrow__pace num">
                {paceClock(paceToDisplay(row.adjustedSpm, state.unit))}
                <span className="condrow__unit"> /{unit}</span>
              </span>
              <span
                className={`condrow__delta num${
                  row.multiplier > 1 ? ' condrow__delta--slower' : ' condrow__delta--faster'
                }`}
              >
                {signedPercent(row.multiplier - 1)}
              </span>
            </div>
          </div>
        ))}

        {showsCombined ? (
          <div className="condtotal">
            <div className="condtotal__main">
              <span className="condtotal__label">Combined</span>
              <span className="condtotal__note">
                {model.combinedDeltaSeconds >= 0 ? '+' : '−'}
                {paceClock(Math.abs(model.combinedDeltaSeconds))} versus your input pace
              </span>
            </div>
            <div className="condtotal__numbers">
              <span className="condtotal__pace num">
                {paceClock(paceToDisplay(model.combinedSpm, state.unit))}
                <span className="condrow__unit"> /{unit}</span>
              </span>
              <span
                className={`condrow__delta num${
                  model.combined.combined > 1
                    ? ' condrow__delta--slower'
                    : ' condrow__delta--faster'
                }`}
              >
                {signedPercent(model.combined.combined - 1)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="stack" style={{ marginTop: 'var(--s-4)', gap: 'var(--s-3)' }}>
        {hasGrade ? (
          <Notice tone="info">
            Grade figures are an <strong>effort equivalence</strong>, not a pace you
            could run. At +10% the shown pace is far faster than race pace — that is the
            point of the comparison.
          </Notice>
        ) : null}

        {hasHeuristic ? (
          <Notice tone="info">
            Heat adjustment is coach-derived guidance, not a physiological prediction.
            Individual responses vary widely.
          </Notice>
        ) : null}

        {combinedWarning ? <Notice tone="warn">{combinedWarning.message}</Notice> : null}
      </div>

      <Disclosure title="How conditions are calculated">
        <p>
          <strong>Grade</strong> uses the Minetti et al. (2002) running energy-cost
          polynomial, evaluated at your average gradient. The curve is U-shaped: mild
          descents cost less than flat running, and steep descents cost more again
          because braking is not free. The cheapest gradient is about −18%.
        </p>
        <p>
          <strong>Heat</strong> uses the temperature + dew point sum, in Fahrenheit. Dew
          point is used rather than relative humidity because it determines whether sweat
          can actually evaporate. The penalty scales with duration, so a 5K in heat costs
          far less than a marathon in the same heat.
        </p>
        <p>
          <strong>Altitude</strong> follows Wehrlin &amp; Hallén (2006): roughly a 6.3%
          decline in VO₂max per 1000 m above threshold, with performance declining faster
          than VO₂max itself.
        </p>
        <p>
          Conditions are combined multiplicatively, which is an approximation — they are
          not truly independent. When the combined adjustment is large, the result is
          deliberately flagged rather than presented as precise.
        </p>
      </Disclosure>
    </Card>
  );
}
