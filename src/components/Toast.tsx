import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';

export type ToastKind = 'success' | 'info' | 'warning';

type Toast = { id: number; kind: ToastKind; message: string; out?: boolean };

type ToastApi = { notify: (message: string, kind?: ToastKind) => void };

const ToastContext = createContext<ToastApi>({ notify: () => undefined });

/** Call `useToast().notify('Saved')` from anywhere under <ToastProvider>. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, kind, message }]);
    // Fade out, then remove.
    window.setTimeout(() => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, out: true } : t)));
      window.setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== id));
      }, 360);
    }, 3200);
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} className={`toast${t.out ? ' out' : ''}`}>
              <span className="toast-icon">
                <Icon size={16} />
              </span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
