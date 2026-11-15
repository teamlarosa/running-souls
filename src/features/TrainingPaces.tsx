/**
 * TrainingPaces.tsx — the "Training Paces" card.
 *
 * Runs two independent strategies (Daniels VDOT and goal-race-pace deltas) and
 * shows the CONSENSUS between them.
 *
 * Easy is a range. Marathon and Tempo (threshold) are single paces — Daniels
 * prescribes those as one pace, not a band — taken as the middle of where the
 * two strategies overlap (or of the full span if they don't overlap).
 */

import { useMemo, type ReactNode } from 'react';
import {
  consensus,
  danielsZonesFromRace,
  goalDeltaZones,
  type ZoneId,
  type ZoneTable,
} from '@running/engine';
import { Card, DataRow, Disclosure, IconBadge, Notice } from '../components/Ui';
import { IconActivity, IconTimer, IconWaves } from '../components/Icons';
import type { Calculator } from '../state';
import { paceClock, paceToDisplay, paceRange, unitLabel } from '../format';

const ZONE_META: Record<
  ZoneId,
  { label: string; tone: 'lavender' | 'peach' | 'pink'; icon: ReactNode; single: boolean }
> = {
  easy: { label: 'Easy run', tone: 'lavender', icon: <IconWaves size={18} />, single: false },
  marathon: { label: 'Marathon', tone: 'peach', icon: <IconActivity size={18} />, single: true },
  threshold: { label: 'Tempo', tone: 'pink', icon: <IconTimer size={18} />, single: true },
  interval: { label: 'Interval', tone: 'pink', icon: <IconTimer size={18} />, single: false },
  repetition: { label: 'Repetition', tone: 'pink', icon: <IconTimer size={18} />, single: false },
};

/** Zones shown in the compact card, slowest to fastest; the rest go in the table. */
const PRIMARY_ZONES: readonly ZoneId[] = ['easy', 'marathon', 'threshold'];

const AGREEMENT_COPY = {
  strong: 'strategies agree closely',
  moderate: 'strategies broadly agree',
  poor: 'strategies disagree',
} as const;

/** Middle of the agreed band, or of the full span when the strategies don't overlap. */
const centreSpm = (zone: {
  agreedSlowSpm: number | null;
  agreedFastSpm: number | null;
  unionSlowSpm: number;
  unionFastSpm: number;
}): number => {
  const slow = zone.agreedSlowSpm ?? zone.unionSlowSpm;
  const fast = zone.agreedFastSpm ?? zone.unionFastSpm;
  return (slow + fast) / 2;
};

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
    <Card title="Training paces" note={`suggested · min/${unit}`}>
      <div className="tp-list">
        {PRIMARY_ZONES.map((id) => {
          const zone = zoneById.get(id);
          const meta = ZONE_META[id];
          if (!zone) return null;

          const value = meta.single
            ? paceClock(paceToDisplay(centreSpm(zone), calc.state.unit))
            : paceRange(zone.unionSlowSpm, zone.unionFastSpm, calc.state.unit);

          return (
            <DataRow
              key={id}
              badge={<IconBadge tone={meta.tone}>{meta.icon}</IconBadge>}
              label={meta.label}
              meta={AGREEMENT_COPY[zone.agreement]}
              value={value}
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
          <strong>widest</strong> is the full span across them. Marathon and Tempo above
          are shown as a single pace: the middle of the agreed band. VDOT is an effective
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
