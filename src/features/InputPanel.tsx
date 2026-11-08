/**
 * InputPanel.tsx — the left column. Mirrors the mockup's card stack:
 * unit toggle, distance, time-or-pace, plus optional conditions.
 *
 * Interaction note: the mockup shows BOTH a Time and a Pace field. Because the
 * engine needs exactly one of the two (distance is already pinned), typing in
 * one field makes it authoritative and clears the other. That keeps the visual
 * layout while removing the ambiguity of two conflicting values.
 */

import type { ReactNode } from 'react';
import {
  DISTANCES,
  PICKER_ORDER,
  type DistanceId,
  type UnitSystem,
} from '@running/engine';
import type { Calculator } from '../state';
import { distanceDisplay, paceClock, paceToDisplay, unitLabel } from '../format';
import { Field, Select, Segmented } from '../components/Ui';
import { IconFlame, IconMountain, IconSlope } from '../components/Icons';

const QUICK_PICKS: readonly { id: DistanceId; label: string }[] = [
  { id: '5000m', label: '5K' },
  { id: '10000m', label: '10K' },
  { id: 'half_marathon', label: 'Half' },
  { id: 'marathon', label: 'Marathon' },
];

export function InputPanel({ calc }: { calc: Calculator }) {
  const { state, derived, setField, setCondition, setUnit } = calc;
  const unit = unitLabel(state.unit);

  const distanceLabel =
    state.distanceId === 'custom'
      ? 'Custom distance'
      : `${DISTANCES[state.distanceId].short} · ${distanceDisplay(
          DISTANCES[state.distanceId].m,
          state.unit,
        )} ${unit}`;

  const enterTime = (value: string) => {
    setField('timeStr', value);
    if (value.trim() !== '' && state.paceStr !== '') setField('paceStr', '');
    setField('active', 'time');
  };

  const enterPace = (value: string) => {
    setField('paceStr', value);
    if (value.trim() !== '' && state.timeStr !== '') setField('timeStr', '');
    setField('active', 'pace');
  };

  const derivedPaceHint =
    state.active === 'time' && derived.spm !== null
      ? `= ${paceClock(paceToDisplay(derived.spm, state.unit))} /${unit}`
      : undefined;

  const errorFor = (field: 'distance' | 'duration' | 'pace') =>
    derived.fieldError?.field === field ? derived.fieldError.message : null;

  return (
    <div className="stack">
      <section className="card">
        <header className="card-head">
          <h2 className="card-title">Your run</h2>
          <Segmented<UnitSystem>
            ariaLabel="Distance units"
            value={state.unit}
            onChange={setUnit}
            options={[
              { value: 'imperial', label: 'mi' },
              { value: 'metric', label: 'km' },
            ]}
          />
        </header>

        <div className="stack" style={{ gap: 'var(--s-5)' }}>
          {/* ---- Distance ------------------------------------------------ */}
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <Select
              id="distance"
              label="Choose your distance"
              value={state.distanceId}
              onChange={(next) => setField('distanceId', next as DistanceId | 'custom')}
            >
              {PICKER_ORDER.map((id) => (
                <option key={id} value={id}>
                  {DISTANCES[id].short} · {distanceDisplay(DISTANCES[id].m, state.unit)} {unit}
                </option>
              ))}
              <option value="custom">Custom distance…</option>
            </Select>

            {state.distanceId === 'custom' ? (
              <Field
                id="custom-distance"
                label="Distance"
                value={state.customDistance}
                onChange={(next) => setField('customDistance', next)}
                placeholder={state.unit === 'imperial' ? '13.1' : '21.097'}
                suffix={unit}
                inputMode="decimal"
                error={errorFor('distance')}
              />
            ) : null}

            <div className="pills" role="group" aria-label="Quick distances">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick.id}
                  type="button"
                  className="pill"
                  aria-pressed={state.distanceId === pick.id}
                  onClick={() => setField('distanceId', pick.id)}
                >
                  {pick.label}
                </button>
              ))}
            </div>

            <p className="field__hint" aria-live="polite">
              {distanceLabel}
            </p>
          </div>

          {/* ---- Time or pace ------------------------------------------- */}
          <div className="stack" style={{ gap: 'var(--s-3)' }}>
            <Field
              id="time"
              label="Time"
              value={state.timeStr}
              onChange={enterTime}
              placeholder="0:00"
              suffix="H:MM:SS"
              inputMode="numeric"
              error={errorFor('duration')}
            />

            <Field
              id="pace"
              label="Pace"
              value={state.paceStr}
              onChange={enterPace}
              placeholder="—:—"
              suffix={`min / ${unit}`}
              inputMode="numeric"
              hint={derivedPaceHint}
              error={errorFor('pace')}
            />

            <p className="field__hint">Enter either a time or a pace — whichever you have.</p>
          </div>
        </div>

        {/* ---- Conditions --------------------------------------------- */}
        <div className="disclosure">
          <details>
            <summary className="disclosure__summary">
              Adjust for conditions <span className="dim" style={{ fontWeight: 500 }}>optional</span>
            </summary>

            <div className="stack" style={{ paddingTop: 'var(--s-4)' }}>
              <ConditionRow
                icon={<IconSlope size={16} />}
                title="Grade"
                enabled={state.conditions.gradeOn}
                onToggle={(next) => setCondition('gradeOn', next)}
              >
                <Field
                  id="grade"
                  label="Average grade"
                  value={state.conditions.gradePct}
                  onChange={(next) => setCondition('gradePct', next)}
                  suffix="%"
                  inputMode="decimal"
                />
              </ConditionRow>

              <ConditionRow
                icon={<IconFlame size={16} />}
                title="Heat & humidity"
                enabled={state.conditions.heatOn}
                onToggle={(next) => setCondition('heatOn', next)}
              >
                <div className="cond-grid">
                  <Field
                    id="temp"
                    label="Temperature"
                    value={state.conditions.tempF}
                    onChange={(next) => setCondition('tempF', next)}
                    suffix="°F"
                    inputMode="decimal"
                  />
                  <Field
                    id="dew"
                    label="Dew point"
                    value={state.conditions.dewPointF}
                    onChange={(next) => setCondition('dewPointF', next)}
                    suffix="°F"
                    inputMode="decimal"
                  />
                </div>
              </ConditionRow>

              <ConditionRow
                icon={<IconMountain size={16} />}
                title="Altitude"
                enabled={state.conditions.altitudeOn}
                onToggle={(next) => setCondition('altitudeOn', next)}
              >
                <Field
                  id="elevation"
                  label="Race elevation"
                  value={state.conditions.elevationM}
                  onChange={(next) => setCondition('elevationM', next)}
                  suffix="m"
                  inputMode="numeric"
                />
              </ConditionRow>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function ConditionRow({
  icon,
  title,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={`cond${enabled ? ' cond--on' : ''}`}>
      <div className="cond__head">
        <span className="cond__icon">{icon}</span>
        <span className="cond__title">{title}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Adjust for ${title.toLowerCase()}`}
          className={`switch${enabled ? ' switch--on' : ''}`}
          onClick={() => onToggle(!enabled)}
        >
          <span className="switch__knob" />
        </button>
      </div>
      {enabled ? <div className="cond__body">{children}</div> : null}
    </div>
  );
}
