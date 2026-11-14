import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n.tsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'land';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink/90 disabled:bg-ink/40',
  land: 'bg-ochre text-[#1B2830] hover:brightness-95 disabled:bg-ochre/40',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line hover:bg-paper disabled:text-ink-faint',
  danger: 'bg-surface text-signal ring-1 ring-inset ring-signal/40 hover:bg-signal hover:text-white disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink disabled:opacity-40',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-balcony disabled:cursor-not-allowed ${
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm'
      } ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[12.5px] font-medium text-ink-soft">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-signal">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-balcony focus:outline-none focus:ring-2 focus:ring-balcony/20 disabled:bg-paper';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

/** Money/number input with an optional unit shown inside the box. */
export function UnitInput({ unit, prefix, ...props }: InputHTMLAttributes<HTMLInputElement> & { unit?: string; prefix?: string }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-faint">{prefix}</span>}
      <input
        inputMode="decimal"
        autoComplete="off"
        {...props}
        className={`${inputClass} tabular-nums ${prefix ? 'pl-6' : ''} ${unit ? 'pr-12' : ''}`}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-ink-faint">{unit}</span>}
    </div>
  );
}

/** Floating side panel on desktop, bottom sheet on mobile. */
export function Panel({
  title,
  onClose,
  children,
  footer,
  accent,
  accentColor,
  wide,
}: {
  title?: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  accent?: 'project' | 'land' | 'draft';
  /** Overrides the accent bar colour (e.g. a land plot's own colour). */
  accentColor?: string;
  wide?: boolean;
}) {
  const bar = accent === 'project' ? 'bg-balcony' : accent === 'land' ? 'bg-ochre' : accent === 'draft' ? 'bg-signal' : 'bg-transparent';
  return (
    <section
      className={`panel-enter pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex max-h-[62vh] flex-col overflow-hidden rounded-t-xl bg-surface shadow-float md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:max-h-[calc(100%-1.5rem)] md:rounded-lg ${
        wide ? 'md:w-[420px]' : 'md:w-[360px]'
      }`}
    >
      <div className={`h-1 shrink-0 ${bar}`} style={accentColor ? { background: accentColor } : undefined} />
      {title !== undefined && (
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-3">
          <h2 className="text-[15px] font-semibold leading-snug text-ink">{title}</h2>
          <CloseButton onClick={onClose} />
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer && <footer className="shrink-0 border-t border-line bg-paper/60 px-4 py-2.5">{footer}</footer>}
    </section>
  );
}

export function CloseButton({ onClick, className = '' }: { onClick(): void; className?: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('Close')}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-balcony ${className}`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Modal({ title, onClose, children, width = 'max-w-md' }: { title: string; onClose(): void; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} rounded-lg bg-surface shadow-float`}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <CloseButton onClick={onClose} />
        </header>
        <div className="max-h-[75dvh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmState {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm(): Promise<void> | void;
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose(): void }) {
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  return (
    <Modal title={state.title} onClose={busy ? () => {} : onClose} width="max-w-sm">
      <div className="text-sm leading-relaxed text-ink-soft">{state.message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          {t('Keep it')}
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await state.onConfirm();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t('Deleting…') : state.confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Label / value row used by the information cards. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-x-3 py-1.5 text-[13px]">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
