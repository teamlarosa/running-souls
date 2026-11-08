/**
 * PredictionsCard.tsx — race time prediction from the current result.
 *
 * Riegel at k=1.06 (decision 3). Every prediction carries its confidence band,
 * and extrapolations beyond 4x are flagged rather than presented as fact.
 * No consumer tool shows uncertainty; it is free credibility.
 */

import { useMemo } from 'react';
import { DISTANCES, predictRiegel, type DistanceId } from '@running/engine';
import { Card, Disclosure, Notice, Tag } from '../components/Ui';
import type { Calculator } from '../state';
import { clock, distanceDisplay, unitLabel } from '../format';

const TARGETS: readonly DistanceId[] = ['mile', '5000m', '10000m', 'half_marathon', 'marathon'];

export function PredictionsCard({ calc }: { calc: Calculator }) {
  const { derived, computedAt } = calc;
  const unit = unitLabel(calc.state.unit);

  const rows = useMemo(() => {
    if (derived.distanceM === null || derived.seconds === null) return null;

    return TARGETS.map((id) => {
      const result = predictRiegel({
        fromDistanceM: derived.distanceM as never,
        fromTimeS: derived.seconds as never,
        toDistanceM: DISTANCES[id].m as never,
        computedAt,
      });

      if (!result.ok) return { id, error: result.message } as const;

      const extrapolated = result.value.prov.warnings.some(
        (warning) => warning.code === 'EXTRAPOLATION',
      );

      return { id, value: result.value, extrapolated } as const;
    });
  }, [derived.distanceM, derived.seconds, computedAt]);

  if (rows === null) {
    return (
      <Card title="Race predictions">
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Enter a distance and a time to predict other races.
        </p>
      </Card>
    );
  }

  // Which row corresponds to the distance already entered — within 0.5%.
  const sourceId = nearestTarget(derived.distanceM ?? 0);
  const anyExtrapolated = rows.some(
    (row) => 'extrapolated' in row && row.extrapolated && row.id !== sourceId,
  );

  return (
    <Card title="Race predictions" aside={<Tag tone="neutral">Riegel · k = 1.06</Tag>}>
      <div className="pred-list">
        {rows.map((row) => {
          if ('error' in row) {
            return (
              <div className="pred" key={row.id}>
                <span className="pred__name">{DISTANCES[row.id].name}</span>
                <span className="pred__value dim">not reliable</span>
              </div>
            );
          }

          const isSource = row.id === sourceId;

          return (
            <div className={`pred${isSource ? ' pred--source' : ''}`} key={row.id}>
              <span className="pred__name">
                {DISTANCES[row.id].name}
                {isSource ? <span className="pred__badge">your result</span> : null}
                {row.extrapolated && !isSource ? (
                  <span className="pred__badge pred__badge--warn">extrapolated</span>
                ) : null}
              </span>
              <span className="pred__value num">
                {clock(row.value.seconds)}
                <span className="pred__pm"> ± {clock(row.value.uncertaintyS)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <Disclosure title="How to read these">
        <p>
          Predictions use the Riegel model: <code>T₂ = T₁ × (D₂ / D₁)^1.06</code>. The
          1.06 exponent is a population average, not a personal one — it assumes you are
          equally trained for both distances.
        </p>
        <p>
          The <strong>±</strong> figure is a confidence band that widens as the
          prediction moves further from your reference distance. Anything marked{' '}
          <em>extrapolated</em> is beyond 4× the distance you entered; Riegel himself
          cautioned against trusting those.
        </p>
        <p>
          Once you have three or more race results saved, the engine can fit your own
          endurance exponent instead of using the population average.
        </p>
      </Disclosure>

      {anyExtrapolated ? (
        <div style={{ marginTop: 'var(--s-3)' }}>
          <Notice tone="warn">
            Predictions this far from your reference distance read as a ceiling, not an
            expectation. Enter a closer race result for a usable number.
          </Notice>
        </div>
      ) : null}

      <p className="field__hint" style={{ marginTop: 'var(--s-3)' }}>
        Reference:{' '}
        {derived.distanceM !== null
          ? `${distanceDisplay(derived.distanceM, calc.state.unit)} ${unit}`
          : '—'}
      </p>
    </Card>
  );
}

/** Nearest prediction target to the entered distance, if within 0.5%. */
const nearestTarget = (metres: number): DistanceId | null => {
  if (!(metres > 0)) return null;

  let best: DistanceId | null = null;
  let bestDelta = Infinity;

  for (const id of TARGETS) {
    const delta = Math.abs(DISTANCES[id].m - metres);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = id;
    }
  }

  return best !== null && bestDelta / metres < 0.005 ? best : null;
};
