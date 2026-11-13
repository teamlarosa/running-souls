/**
 * InputPanel.tsx — the left column.
 *
 * Distance, then a finish-time group (hh:mm:ss) and a pace group (mm:ss) made of
 * separate number-pad boxes, so phones never need a colon key. Empty boxes
 * count as zero. The group edited last is the one that gets solved; the other
 * dims. The lime Calculate button (or Enter in any box) runs the calculation.
 */

import { Fragment, useRef, type ReactNode } from 'react';
import {
  DISTANCES,
  PICKER_ORDER,
  type DistanceId,
  type UnitSystem,
} from '@running/engine';
import type { Calculator } from '../state';
import { hasPaceInput, hasTimeInput } from '../state';
import { distanceDisplay, unitLabel } from '../format';
import { Field, Select, Segmented } from '../components/Ui';
import { IconFlame, IconMountain, IconSlope } from '../components/Icons';

const QUICK_PICKS: readonly { id: DistanceId; label: string }[] = [
  { id: '5000m', label: '5K' },
  { id: '10000m', label: '10K' },
  { id: 'half_marathon', label: 'Half' },
  { id: 'marathon', label: 'Marathon' },
];

interface DigitBox {
  id: string;
  caption: string;
  value: string;
  onChange: (digits: string) => void;
}

/** A row of 1–3 digit boxes: digits only, number pad on phones, auto-advance. */
function DigitGroup({
  title,
  boxes,
  dimmed,
  error,
  trailing,
}: {
  title: string;
  boxes: readonly DigitBox[];
  dimmed: boolean;
  error: string | null;
  trailing?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    boxes[index]?.onChange(digits);
    if (digits.length === 2 && index < boxes.length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, key: string, value: string) => {
    if (key === 'Backspace' && value === '' && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const classes = ['dg', dimmed ? 'dg--dim' : '', error ? 'dg--error' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="group" aria-label={title}>
      <span className="dg__title">{title}</span>

      <div className="dg__row">
        {boxes.map((box, index) => (
          <Fragment key={box.id}>
            {index > 0 ? (
              <span className="dg__sep" aria-hidden="true">
                :
              </span>
            ) : null}
            <label className="dg__cell" htmlFor={box.id}>
              <input
                id={box.id}
                ref={(el) => {
                  refs.current[index] = el;
                }}
                className="dg__input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                enterKeyHint="go"
                maxLength={2}
                placeholder="00"
                value={box.value}
                aria-invalid={error ? true : undefined}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e.key, e.currentTarget.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <span className="dg__cap">{box.caption}</span>
            </label>
          </Fragment>
        ))}
        {trailing ? <span className="dg__trailing">{trailing}</span> : null}
      </div>

      {error ? (
        <p className="dg__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function InputPanel({
  calc,
  onCalculate,
}: {
  calc: Calculator;
  onCalculate: () => void;
}) {
  const { draft, errors, solveFor, stale, setInput, setCondition, setUnit } = calc;
  const unit = unitLabel(draft.unit);

  const distanceLabel =
    draft.distanceId === 'custom'
      ? 'Custom distance'
      : `${DISTANCES[draft.distanceId].short} · ${distanceDisplay(
          DISTANCES[draft.distanceId].m,
          draft.unit,
        )} ${unit}`;

  // Dim whichever group is being ignored (only once the other has a value).
  const dimTime = solveFor === 'pace' && hasPaceInput(draft);
  const dimPace = solveFor === 'time' && hasTimeInput(draft);

  // Enter in any text box behaves exactly like tapping Calculate.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      onCalculate();
    }
  };

  return (
    <div className="stack">
      <section className="card" onKeyDown={handleKeyDown}>
        <header className="card-head">
          <h2 className="card-title">Your run</h2>
          <Segmented<UnitSystem>
            ariaLabel="Distance units"
            value={draft.unit}
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
              value={draft.distanceId}
              onChange={(next) => setInput({ distanceId: next as DistanceId | 'custom' })}
            >
              {PICKER_ORDER.map((id) => (
                <option key={id} value={id}>
                  {DISTANCES[id].short} · {distanceDisplay(DISTANCES[id].m, draft.unit)} {unit}
                </option>
              ))}
              <option value="custom">Custom distance…</option>
            </Select>

            {draft.distanceId === 'custom' ? (
              <Field
                id="custom-distance"
                label="Distance"
                value={draft.customDistance}
                onChange={(next) => setInput({ customDistance: next })}
                placeholder={draft.unit === 'imperial' ? '13.1' : '21.097'}
                suffix={unit}
                inputMode="decimal"
                error={errors.distance}
              />
            ) : null}

            <div className="pills" role="group" aria-label="Quick distances">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick.id}
                  type="button"
                  className="pill"
                  aria-pressed={draft.distanceId === pick.id}
                  onClick={() => setInput({ distanceId: pick.id })}
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
            <DigitGroup
              title="Finish time"
              dimmed={dimTime}
              error={errors.time}
              boxes={[
                {
                  id: 'time-h',
                  caption: 'hh',
                  value: draft.timeH,
                  onChange: (v) => setInput({ timeH: v, active: 'time' }),
                },
                {
                  id: 'time-m',
                  caption: 'mm',
                  value: draft.timeM,
                  onChange: (v) => setInput({ timeM: v, active: 'time' }),
                },
                {
                  id: 'time-s',
                  caption: 'ss',
                  value: draft.timeS,
                  onChange: (v) => setInput({ timeS: v, active: 'time' }),
                },
              ]}
            />

            <DigitGroup
              title="Pace"
              dimmed={dimPace}
              error={errors.pace}
              trailing={`/ ${unit}`}
              boxes={[
                {
                  id: 'pace-m',
                  caption: 'mm',
                  value: draft.paceM,
                  onChange: (v) => setInput({ paceM: v, active: 'pace' }),
                },
                {
                  id: 'pace-s',
                  caption: 'ss',
                  value: draft.paceS,
                  onChange: (v) => setInput({ paceS: v, active: 'pace' }),
                },
              ]}
            />

            <p className="field__hint">
              Enter either a time or a pace. The one you edit last is used; empty boxes count as
              zero.
            </p>
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
                enabled={draft.conditions.gradeOn}
                onToggle={(next) => setCondition('gradeOn', next)}
              >
                <Field
                  id="grade"
                  label="Average grade"
                  value={draft.conditions.gradePct}
                  onChange={(next) => setCondition('gradePct', next)}
                  suffix="%"
                  inputMode="decimal"
                />
              </ConditionRow>

              <ConditionRow
                icon={<IconFlame size={16} />}
                title="Heat & humidity"
                enabled={draft.conditions.heatOn}
                onToggle={(next) => setCondition('heatOn', next)}
              >
                <div className="cond-grid">
                  <Field
                    id="temp"
                    label="Temperature"
                    value={draft.conditions.tempF}
                    onChange={(next) => setCondition('tempF', next)}
                    suffix="°F"
                    inputMode="decimal"
                  />
                  <Field
                    id="dew"
                    label="Dew point"
                    value={draft.conditions.dewPointF}
                    onChange={(next) => setCondition('dewPointF', next)}
                    suffix="°F"
                    inputMode="decimal"
                  />
                </div>
              </ConditionRow>

              <ConditionRow
                icon={<IconMountain size={16} />}
                title="Altitude"
                enabled={draft.conditions.altitudeOn}
                onToggle={(next) => setCondition('altitudeOn', next)}
              >
                <Field
                  id="elevation"
                  label="Race elevation"
                  value={draft.conditions.elevationM}
                  onChange={(next) => setCondition('elevationM', next)}
                  suffix="m"
                  inputMode="numeric"
                />
              </ConditionRow>
            </div>
          </details>
        </div>

        {/* ---- The action --------------------------------------------- */}
        <button
          type="button"
          className={`calc-btn${stale ? ' calc-btn--attn' : ''}`}
          onClick={onCalculate}
        >
          Calculate
        </button>
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
