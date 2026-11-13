/**
 * HeroPace.tsx — the teal result card.
 *
 * Three states:
 *   1. Before the first Calculate (or nothing usable entered): a prompt.
 *   2. Result: pace (if you gave a time) or finish time (if you gave a pace).
 *   3. Stale: inputs changed since the last Calculate, so the card greys out.
 */

import { DISTANCES } from '@running/engine';
import { IconBolt } from '../components/Icons';
import type { Calculator } from '../state';
import { clock, distanceDisplay, paceClock, paceToDisplay, unitLabel } from '../format';

const PROMPT = 'Enter a time or pace, then tap Calculate';

/** Short badge label for the solved distance — a lookup, not string surgery. */
const badgeFor = (distanceId: string): string => {
  switch (distanceId) {
    case 'half_marathon':
      return 'HALF';
    case 'marathon':
      return 'MARATHON';
    case 'mile':
      return 'MILE';
    case 'custom':
      return 'CUSTOM';
    default: {
      const entry = (DISTANCES as Record<string, { short: string } | undefined>)[distanceId];
      return (entry?.short ?? 'RUN').toUpperCase();
    }
  }
};

export function HeroPace({ calc }: { calc: Calculator }) {
  const { state, derived, hasCalculated, stale } = calc;
  const unit = unitLabel(state.unit);

  const solved =
    derived.spm !== null && derived.seconds !== null && derived.solvedFor !== null;

  // ---- Prompt / error state ----------------------------------------------
  if (!hasCalculated || !solved) {
    const message = hasCalculated && derived.fieldError ? derived.fieldError.message : PROMPT;

    return (
      <section
        id="result"
        className={`hero hero--empty${stale ? ' hero--stale' : ''}`}
        aria-label="Result"
      >
        <div className="hero__top">
          <span className="hero__label">Result</span>
        </div>
        <p className="hero__prompt" aria-live="polite">
          {message}
        </p>
      </section>
    );
  }

  // ---- Result state -------------------------------------------------------
  const paceText = paceClock(paceToDisplay(derived.spm as number, state.unit));
  const totalText = clock(derived.seconds as number);
  const distanceText = distanceDisplay(derived.distanceM as number, state.unit);

  // Gave a time → solved pace. Gave a pace → solved finish time.
  const solvedPace = derived.solvedFor === 'time';

  return (
    <section
      id="result"
      className={`hero${stale ? ' hero--stale' : ''}`}
      aria-label="Result"
    >
      <div className="hero__top">
        <span className="hero__label">{solvedPace ? 'Average pace' : 'Finish time'}</span>
        <span className="hero__badge">
          <IconBolt size={12} />
          {badgeFor(state.distanceId)}
        </span>
      </div>

      <div className="hero__value" aria-live="polite">
        {solvedPace ? paceText : totalText}
        {solvedPace ? <span className="hero__unit">/ {unit}</span> : null}
      </div>

      <div className="hero__secondary">
        <div className="hero__stat">
          <span className="hero__stat-label">Distance</span>
          <span className="hero__stat-value">
            {distanceText} {unit}
          </span>
        </div>
        <div className="hero__stat">
          <span className="hero__stat-label">{solvedPace ? 'Total time' : 'Pace'}</span>
          <span className="hero__stat-value">
            {solvedPace ? totalText : `${paceText} / ${unit}`}
          </span>
        </div>
      </div>

      {stale ? <p className="hero__note">Inputs changed. Tap Calculate to update.</p> : null}
    </section>
  );
}
