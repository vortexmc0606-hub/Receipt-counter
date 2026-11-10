import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useCountUp, useTilt } from '../lib/motion';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Close on Escape for a proper dialog feel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={wide ? { maxWidth: 900 } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * A stat tile. When `numeric` is given the value counts up on mount; otherwise
 * the preformatted `value` string is shown as-is.
 */
export function Stat({
  label,
  value,
  sub,
  icon,
  numeric,
  format,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  numeric?: number;
  format?: (n: number) => string;
}) {
  const tiltRef = useTilt<HTMLDivElement>(4);
  const animated = useCountUp(numeric ?? 0);
  const display = numeric !== undefined && format ? format(animated) : value;

  return (
    <div className="card stat" ref={tiltRef}>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{display}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{title}</h3>
      <div className="tiny muted">{children}</div>
    </div>
  );
}

/** Animates a plain number into view; used for inline counters. */
export function CountUp({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const n = useCountUp(value);
  return <>{format(n)}</>;
}

/** A one-shot flash used to confirm a copied/updated value. */
export function useFlash(ms = 900): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(t);
  }, [on, ms]);
  return [on, () => setOn(true)];
}

