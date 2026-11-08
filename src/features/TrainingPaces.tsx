/**
 * TrainingPaces.tsx — the "Training Paces" card, read-only (decision 2).
 *
 * Runs two independent strategies (Daniels VDOT and goal-race-pace deltas) and
 * shows the CONSENSUS: the band where both agree, plus an agreement rating.
 *
 * Where strategies converge the number is trustworthy. Where they diverge,
 * showing that is the honest answer rather than hiding behind one house formula.
 */

import { useMemo, type ReactNode } from 'react';
import {
  consensus,
  danielsZonesFromRace,
  goalDeltaZones,
  type ZoneId,
  type ZoneTable,
} from '@running/engine';
import { Card, DataRow, Disclosure, IconBadge, Notice, Tag } from '../components/Ui';
import { IconActivity, IconTimer, IconWaves } from '../components/Icons';
import type { Calculator } from '../state';
import { paceClock, paceToDisplay, paceRange, unitLabel } from '../format';

const ZONE_META: Record<
  ZoneId,
  { label: string; tone: 'lavender' | 'peach' | 'pink'; icon: ReactNode }
> = {
  easy: { label: 'Easy run', tone: 'lavender', icon: <IconWaves size={18} /> },
  marathon: { label: 'Marathon', tone: 'peach', icon: <IconActivity size={18} /> },
  threshold: { label: 'Tempo', tone: 'peach', icon: <IconActivity size={18} /> },
  interval: { label: 'Interval', tone: 'pink', icon: <IconTimer size={18} /> },
  repetition: { label: 'Repetition', tone: 'pink', icon: <IconTimer size={18} /> },
};

/** Zones worth showing in the compact card; the rest go in the table. */
const PRIMARY_ZONES: readonly ZoneId[] = ['easy', 'threshold', 'interval'];

const AGREEMENT_COPY = {
  strong: 'strategies agree closely',
  moderate: 'strategies broadly agree',
  poor: 'strategies disagree',
} as const;

export function TrainingPaces({ calc }: { calc: Calculator }) {
  const { derived, computedAt } = calc;
  const unit = unitLabel(calc.state.unit);

  const model = useMemo(() => {
    if (derived.distanceM === null || derived.seconds === null) return null;

    const daniels = danielsZonesFromRace(
      derived.distanceM as never,
      derived.seconds as never,
      computedAt,
    );
    if (!daniels.ok) return { error: daniels.message } as const;

    const deltas = goalDeltaZones(derived.distanceM, derived.seconds, computedAt);
    if (!deltas.ok) return { error: deltas.message } as const;

    const tables: ZoneTable[] = [daniels.value, deltas.value];
    const merged = consensus(tables, computedAt);
    if (!merged.ok) return { error: merged.message } as const;

    return { vdot: daniels.value.vdot, consensus: merged.value } as const;
  }, [derived.distanceM, derived.seconds, computedAt]);

  if (model === null) {
    return (
      <Card title="Training paces" note={`suggested · min/${unit}`}>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Enter a distance and a time to see training paces.
        </p>
      </Card>
    );
  }

  if ('error' in model) {
    return (
      <Card title="Training paces" note={`suggested · min/${unit}`}>
        <Notice tone="warn">{model.error}</Notice>
      </Card>
    );
  }

  const zoneById = new Map(model.consensus.zones.map((zone) => [zone.id, zone]));
  const anyDisagreement = model.consensus.zones.some((zone) => zone.agreement === 'poor');

  return (
    <Card title="Training paces" aside={<Tag tone="provisional">read-only preview</Tag>}>
      <div className="tp-list">
        {PRIMARY_ZONES.map((id) => {
          const zone = zoneById.get(id);
          const meta = ZONE_META[id];
          if (!zone) return null;

          return (
            <DataRow
              key={id}
              badge={<IconBadge tone={meta.tone}>{meta.icon}</IconBadge>}
              label={meta.label}
              meta={AGREEMENT_COPY[zone.agreement]}
              value={paceRange(zone.unionSlowSpm, zone.unionFastSpm, calc.state.unit)}
            />
          );
        })}
      </div>

      {anyDisagreement ? (
        <div style={{ marginTop: 'var(--s-4)' }}>
          <Notice tone="info">
            Strategies disagree in at least one zone. That gap is real information — see
            the full table before trusting a single number.
          </Notice>
        </div>
      ) : null}

      <Disclosure title={`All zones · VDOT ${model.vdot.toFixed(1)}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col">Agreed</th>
                <th scope="col">Widest</th>
                <th scope="col">Fit</th>
              </tr>
            </thead>
            <tbody>
              {model.consensus.zones.map((zone) => (
                <tr key={zone.id}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 600 }}>
                    {ZONE_META[zone.id].label}
                  </th>
                  <td>
                    {zone.agreedSlowSpm !== null && zone.agreedFastSpm !== null
                      ? `${paceClock(
                          paceToDisplay(zone.agreedSlowSpm, calc.state.unit),
                        )}–${paceClock(paceToDisplay(zone.agreedFastSpm, calc.state.unit))}`
                      : 'no overlap'}
                  </td>
                  <td>
                    {paceClock(paceToDisplay(zone.unionSlowSpm, calc.state.unit))}–
                    {paceClock(paceToDisplay(zone.unionFastSpm, calc.state.unit))}
                  </td>
                  <td className={zone.agreement === 'poor' ? '' : 'muted'}>{zone.agreement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 'var(--s-3)' }}>
          <strong>Agreed</strong> is where both methodologies overlap;{' '}
          <strong>widest</strong> is the full span across them. VDOT is an effective
          fitness index that absorbs running economy — it is <em>not</em> measured VO₂max.
        </p>
        <p>
          Zone bands are provisional pending calibration against the published table.
          Paces are computed from the Daniels–Gilbert oxygen-cost equations.
        </p>
      </Disclosure>
    </Card>
  );
}
