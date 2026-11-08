/**
 * AboutCard.tsx — the visible "how we calculate this" panel.
 *
 * This is a product feature, not hygiene. The differentiator is that every
 * number is traceable, so the citations have to be reachable from the UI rather
 * than buried in a repository.
 */

import { CALIBRATION, ENGINE_VERSION, SOURCES, config } from '@running/engine';
import type { Calibration } from '../components/Ui';
import { Card, Disclosure, Tag } from '../components/Ui';

const MODEL_COPY: readonly { key: string; label: string; what: string; source: string }[] = [
  {
    key: 'split',
    label: 'Pace and splits',
    what: 'Distance, time and pace are three views of one relationship. Splits round on cumulative time, then difference, so rows always sum to the total exactly.',
    source: 'definition: pace = duration ÷ distance',
  },
  {
    key: 'vdot',
    label: 'Training paces',
    what: 'Zone bands are percentages of an effective fitness index (VDOT), inverted through the oxygen-cost curve. VDOT absorbs running economy — it is not measured VO₂max.',
    source: SOURCES.vdot.citation,
  },
  {
    key: 'riegel',
    label: 'Predictions',
    what: 'Time scales as the 1.06 power of distance. That exponent is a population average; it assumes equal training for both distances.',
    source: SOURCES.riegel.citation,
  },
  {
    key: 'grade',
    label: 'Grade (GAP)',
    what: 'Metabolic cost of running at a gradient, from the published polynomial. The curve is U-shaped, with the minimum near −18%.',
    source: SOURCES.minetti.citation,
  },
  {
    key: 'heat',
    label: 'Heat',
    what: 'Coach-derived guidance based on temperature + dew point. There is no peer-reviewed formula for this, which is why it is labelled as guidance.',
    source: SOURCES.heat.citation,
  },
  {
    key: 'altitude',
    label: 'Altitude',
    what: 'VO₂max declines linearly above a threshold elevation, with race performance declining faster still.',
    source: SOURCES.altitude.citation,
  },
];

const toneFor = (key: string): Calibration | 'neutral' => {
  const status = CALIBRATION[key];
  if (status === 'verified') return 'verified';
  if (status === 'heuristic') return 'heuristic';
  return 'provisional';
};

export function AboutCard() {
  return (
    <Card title="How we calculate this">
      <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
        Every number here is computed from a published model, and every model carries
        its citation. Where a model is an estimate, a heuristic, or extrapolating past
        its valid range, the result says so rather than smoothing it over.
      </p>

      <div className="about-list">
        {MODEL_COPY.map((model) => (
          <div className="about-row" key={model.key}>
            <div className="about-row__head">
              <span className="about-row__label">{model.label}</span>
              <Tag tone={toneFor(model.key)}>
                {CALIBRATION[model.key] ?? 'provisional'}
              </Tag>
            </div>
            <p className="about-row__what">{model.what}</p>
            <p className="about-row__source">{model.source}</p>
          </div>
        ))}
      </div>

      <Disclosure title="What this deliberately does not do">
        <p>
          <strong>It does not claim to be the most accurate.</strong> That is not a claim
          anyone can support. The claim here is that the arithmetic is transparent and
          reproducible: same inputs, same outputs, with the model version recorded.
        </p>
        <p>
          <strong>It does not model surface.</strong> Rock, sand, mud and technical trail
          all cost more energy than a treadmill curve predicts. Grade alone does not
          capture terrain.
        </p>
        <p>
          <strong>It does not individualise beyond your own results.</strong> Some runners
          are relatively better uphill, others downhill. Population curves are population
          curves.
        </p>
        <p>
          <strong>It does not replace a coach.</strong> Auto-generated training paces and
          heat advice are starting points, not prescriptions, and nothing here is medical
          advice.
        </p>
      </Disclosure>

      <p className="about-version">
        engine v{ENGINE_VERSION} · grade v{config.GRADE.version} · heat v
        {config.HEAT.version} · altitude v{config.ALTITUDE.version}
      </p>
    </Card>
  );
}
