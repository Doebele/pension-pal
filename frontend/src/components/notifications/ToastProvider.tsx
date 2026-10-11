import React, { createContext, useCallback, useMemo, useState } from "react";
import { WarningTriangle, CheckCircle, WarningCircle, Xmark } from "iconoir-react";

export type ToastKind = "success" | "warn" | "error";

export type ToastInput = {
  title: string;
  message?: string;
  kind: ToastKind;
};

type ToastItem = ToastInput & {
  id: string;
};

type ToastContextType = {
  showToast: (toast: ToastInput) => void;
};

export const ToastContext = createContext<ToastContextType | null>(null);

const STYLE_BY_KIND: Record<ToastKind, { border: string; icon: React.ReactNode }> = {
  success: {
    border: "border-green-500/70",
    icon: <CheckCircle className="h-4 w-4 text-green-400" />,
  },
  warn: {
    border: "border-amber-500/70",
    icon: <WarningTriangle className="h-4 w-4 text-amber-400" />,
  },
  error: {
    border: "border-red-500/70",
    icon: <WarningCircle className="h-4 w-4 text-red-400" />,
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const next: ToastItem = { id, ...toast };
      setToasts((prev) => [...prev, next]);
      window.setTimeout(() => removeToast(id), 5000);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((toast) => {
          const style = STYLE_BY_KIND[toast.kind];
          return (
            <div
              key={toast.id}
              className={`popover-smooth popover-open popover-mount-in pointer-events-auto rounded-lg border bg-gray-900 px-3 py-2 text-slate-50 shadow-lg ${style.border}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span className="mt-1">{style.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{toast.title}</p>
                    {toast.message && <p className="mt-1 text-xs text-slate-300">{toast.message}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  aria-label="Benachrichtigung schließen"
                >
                  <Xmark className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
