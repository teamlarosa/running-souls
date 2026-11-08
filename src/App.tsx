/**
 * App.tsx — the shell.
 *
 * Desktop-first two-column layout: inputs stay put on the left, results scroll
 * on the right. Below 1000px it collapses to the single-column stack from the
 * mockup, in the same order.
 *
 * (global.css is imported once, in main.tsx.)
 */

import { IconUser } from './components/Icons';
import { useCalculator } from './state';
import { InputPanel } from './features/InputPanel';
import { HeroPace } from './features/HeroPace';
import { ConditionsCard } from './features/ConditionsCard';
import { TrainingPaces } from './features/TrainingPaces';
import { SplitsCard } from './features/SplitsCard';
import { PredictionsCard } from './features/PredictionsCard';
import { AboutCard } from './features/AboutCard';

import './styles/components.css';
import './styles/app.css';
import './styles/features.css';

export function App() {
  const calc = useCalculator();

  return (
    <div className="shell">
      <header className="header">
        <div className="header__brand">
          <h1 className="header__wordmark">
            RUNNING <em>SOULS</em>
          </h1>
          <p className="header__sub">Pace Calculator</p>
        </div>
        <button type="button" className="header__account" aria-label="Your account">
          <IconUser size={20} />
        </button>
      </header>

      <main className="main">
        <div className="layout">
          <div className="layout__aside">
            <InputPanel calc={calc} />
          </div>

          <div className="layout__results">
            <HeroPace calc={calc} />
            <TrainingPaces calc={calc} />
            <ConditionsCard calc={calc} />
            <SplitsCard calc={calc} />
            <PredictionsCard calc={calc} />
            <AboutCard />
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>
          Estimates only — not medical advice. Training paces and heat guidance are
          starting points, not prescriptions. Every model and citation is listed under
          “How we calculate this”.
        </p>
      </footer>
    </div>
  );
}
