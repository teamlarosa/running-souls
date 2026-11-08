/**
 * SplitsCard.tsx — even-pace splits and a two-half pace band.
 *
 * The split table relies on the engine's cumulative-rounding invariant, so the
 * rows always sum to the total exactly. The band strategy is a real choice, not
 * a hidden default.
 */

import { useMemo } from 'react';
import { evenSplits, paceBand, type BandStrategy, type SplitUnit } from '@running/engine';
import { Card, Disclosure, Notice, Segmented } from '../components/Ui';
import type { Calculator } from '../state';
import { clock, paceClock, paceToDisplay, unitLabel } from '../format';

const BAND_OPTIONS: readonly { value: BandStrategy; label: string }[] = [
  { value: 'even', label: 'Even' },
  { value: 'negative_split', label: 'Negative split' },
];

export function SplitsCard({ calc }: { calc: Calculator }) {
  const { state, derived, computedAt, setField } = calc;
  const unit = unitLabel(state.unit);

  const splits = useMemo(() => {
    if (derived.distanceM === null || derived.seconds === null) return null;
    const result = evenSplits(
      derived.distanceM as never,
      derived.seconds as never,
      { unit: state.splitUnit, computedAt },
    );
    return result.ok ? result.value : null;
  }, [derived.distanceM, derived.seconds, state.splitUnit, computedAt]);

  const band = useMemo(() => {
    if (derived.distanceM === null || derived.seconds === null) return null;
    const result = paceBand(derived.distanceM as never, derived.seconds as never, {
      strategy: state.bandStrategy,
      computedAt,
    });
    return result.ok ? result.value : null;
  }, [derived.distanceM, derived.seconds, state.bandStrategy, computedAt]);

  if (!splits || !band) {
    return (
      <Card title="Splits">
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Enter a distance and a time to see splits.
        </p>
      </Card>
    );
  }

  const splitLabel = state.splitUnit === 'mi' ? 'Mile' : 'Km';

  return (
    <Card
      title="Splits"
      aside={
        <Segmented<SplitUnit>
          ariaLabel="Split interval"
          value={state.splitUnit}
          onChange={(next) => setField('splitUnit', next)}
          options={[
            { value: 'mi', label: 'per mi' },
            { value: 'km', label: 'per km' },
          ]}
        />
      }
    >
      {/* ---- Pace band ------------------------------------------------ */}
      <div className="stack" style={{ gap: 'var(--s-3)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="field__label">Pace band</span>
          <Segmented<BandStrategy>
            ariaLabel="Pace band strategy"
            value={state.bandStrategy}
            onChange={(next) => setField('bandStrategy', next)}
            options={BAND_OPTIONS}
          />
        </div>

        <div className="band">
          <div className="band__half">
            <span className="band__label">First half</span>
            <span className="band__pace num">
              {paceClock(paceToDisplay(band.firstHalfPaceSpm, state.unit))}
              <span className="band__unit"> /{unit}</span>
            </span>
            <span className="band__time num">at {clock(band.firstHalfSeconds)}</span>
          </div>
          <div className="band__divider" aria-hidden="true" />
          <div className="band__half">
            <span className="band__label">Second half</span>
            <span className="band__pace num">
              {paceClock(paceToDisplay(band.secondHalfPaceSpm, state.unit))}
              <span className="band__unit"> /{unit}</span>
            </span>
            <span className="band__time num">at {clock(band.secondHalfSeconds)}</span>
          </div>
        </div>

        {state.bandStrategy === 'negative_split' ? (
          <Notice tone="info">
            Negative splits assume controlled early pacing. Most blow-ups come from
            going out too fast — the second half is only faster if the first half is
            disciplined.
          </Notice>
        ) : null}
      </div>

      {/* ---- Split table ---------------------------------------------- */}
      <Disclosure title={`${splitLabel} splits · ${splits.splits.length} rows`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{splitLabel}</th>
                <th scope="col">Split</th>
                <th scope="col">Elapsed</th>
              </tr>
            </thead>
            <tbody>
              {splits.splits.map((split) => (
                <tr key={split.index}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 600 }}>
                    {split.label}
                  </th>
                  <td>{clock(split.splitSeconds)}</td>
                  <td className="muted">{clock(split.cumulativeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 'var(--s-3)' }}>
          Splits are rounded on cumulative time, then differenced — so the rows sum to
          the total exactly, in whole seconds.
        </p>
      </Disclosure>
    </Card>
  );
}
