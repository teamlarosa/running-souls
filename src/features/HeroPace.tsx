/**
 * HeroPace.tsx — the teal "Average Pace" card from the mockup.
 *
 * Shows the solved pace in the user's chosen unit, plus total time and distance
 * as secondary stats.
 */

import { DISTANCES } from '@running/engine';
import { IconBolt } from '../components/Icons';
import type { Calculator } from '../state';
import { clock, distanceDisplay, paceClock, paceToDisplay, unitLabel } from '../format';

/**
 * Short badge label for the solved distance.
 *
 * A lookup, not string surgery: the first attempt transformed '5000m' into
 * '5000K' and 'mile' into 'KILE'. Conventional race names are the only labels
 * anyone recognises anyway.
 */
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
      // Standard distances carry a short label already: '5K', '10K', '1500m'.
      const entry = (DISTANCES as Record<string, { short: string } | undefined>)[distanceId];
      return (entry?.short ?? 'RUN').toUpperCase();
    }
  }
};

export function HeroPace({ calc }: { calc: Calculator }) {
  const { state, derived } = calc;
  const unit = unitLabel(state.unit);

  const hasResult = derived.spm !== null && derived.seconds !== null;
  const pace = hasResult ? paceClock(paceToDisplay(derived.spm as number, state.unit)) : '—:—';
  const total = hasResult ? clock(derived.seconds as number) : '—:—';
  const distance = derived.distanceM !== null ? distanceDisplay(derived.distanceM, state.unit) : '—';

  return (
    <section className="hero" aria-label="Result">
      <div className="hero__top">
        <span className="hero__label">Average pace</span>
        <span className="hero__badge">
          <IconBolt size={12} />
          {badgeFor(state.distanceId)}
        </span>
      </div>

      <div className="hero__value" aria-live="polite">
        {pace}
        <span className="hero__unit">/ {unit}</span>
      </div>

      <div className="hero__secondary">
        <div className="hero__stat">
          <span className="hero__stat-label">Total time</span>
          <span className="hero__stat-value">{total}</span>
        </div>
        <div className="hero__stat">
          <span className="hero__stat-label">Distance</span>
          <span className="hero__stat-value">
            {distance} {unit}
          </span>
        </div>
        <div className="hero__stat">
          <span className="hero__stat-label">Per km</span>
          <span className="hero__stat-value">
            {hasResult && derived.spm !== null
              ? `${paceClock((derived.spm as number) * 1000)}`
              : '—'}
          </span>
        </div>
      </div>
    </section>
  );
}
