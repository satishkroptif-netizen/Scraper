import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastInput {
  kind?: ToastKind;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  kind: ToastKind;
}

interface ToastContextValue {
  pushToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      const item: ToastItem = { ...toast, id, kind: toast.kind || 'info' };
      setToasts((current) => [...current.slice(-3), item]);
      const timer = window.setTimeout(() => dismissToast(id), toast.duration || (item.kind === 'error' ? 8000 : 4500));
      timers.current.set(id, timer);
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const value = useMemo(() => ({ pushToast, dismissToast }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div className={`toast toast-${toast.kind}`} key={toast.id} role="status">
              <span className="toast-icon" aria-hidden="true">
                {toast.kind === 'success' ? <CheckCircle2 size={19} /> : toast.kind === 'error' ? <AlertTriangle size={19} /> : <Info size={19} />}
              </span>
              <div className="toast-body">
                <strong>{toast.title}</strong>
                {toast.message ? <span>{toast.message}</span> : null}
              </div>
              <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}
