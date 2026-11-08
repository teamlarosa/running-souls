/**
 * Ui.tsx — shared primitives, styled from components.css.
 *
 * Deliberately small and unopinionated: the design lives in CSS so the mockup
 * tokens stay authoritative.
 */

import type { ReactNode } from 'react';
import { IconAlert, IconChevronDown, IconChevronRight, IconInfo } from './Icons';

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

export function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  suffix,
  error,
  hint,
  inputMode = 'text',
  autoComplete = 'off',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  suffix?: string;
  error?: string | null;
  hint?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  autoComplete?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className={`field__input-wrap${error ? ' field__input-wrap--error' : ''}`}>
        <input
          id={id}
          className="field__input num"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {suffix ? <span className="field__suffix">{suffix}</span> : null}
      </div>
      {error ? (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="select">
        <select
          id={id}
          className="select__native"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <span className="select__caret">
          <IconChevronDown size={18} />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' switch--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tag — calibration status
// ---------------------------------------------------------------------------

export type Calibration = 'verified' | 'provisional' | 'heuristic';

export function Tag({ tone, children }: { tone: Calibration | 'neutral'; children: ReactNode }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Notice
// ---------------------------------------------------------------------------

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'warn' | 'info' | 'neutral';
  children: ReactNode;
}) {
  const Icon = tone === 'warn' ? IconAlert : tone === 'info' ? IconInfo : IconInfo;
  return (
    <div className={`notice notice--${tone}`} role={tone === 'warn' ? 'status' : undefined}>
      <span className="notice__icon">
        <Icon size={16} />
      </span>
      <span>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IconBadge
// ---------------------------------------------------------------------------

export type BadgeTone = 'lavender' | 'peach' | 'pink' | 'mint' | 'sky';

export function IconBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// DataRow
// ---------------------------------------------------------------------------

export function DataRow({
  badge,
  label,
  meta,
  value,
}: {
  badge?: ReactNode;
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="datarow">
      {badge}
      <div className="datarow__body">
        <div className="datarow__label">{label}</div>
        {meta ? <div className="datarow__meta">{meta}</div> : null}
      </div>
      <div className="datarow__value">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disclosure — native <details>, so it works without JS state
// ---------------------------------------------------------------------------

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="disclosure">
      <summary className="disclosure__summary">
        <span className="disclosure__chevron">
          <IconChevronRight size={14} />
        </span>
        {title}
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

export function Card({
  title,
  note,
  aside,
  children,
  className,
}: {
  title?: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      {title ? (
        <header className="card-head">
          <h2 className="card-title">{title}</h2>
          {aside ?? (note ? <span className="card-note">{note}</span> : null)}
        </header>
      ) : null}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">{icon}</span>
      <p className="empty__title">{title}</p>
      <p className="empty__body">{body}</p>
    </div>
  );
}
