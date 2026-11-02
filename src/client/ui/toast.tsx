// One quiet line at a time, announced politely to screen readers.
import { create } from 'zustand';
import { useEffect } from 'react';

interface ToastState {
  message: string | null;
  key: number;
  show(message: string): void;
  clear(): void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  key: 0,
  show: (message) => set((s) => ({ message, key: s.key + 1 })),
  clear: () => set({ message: null }),
}));

export const toast = (message: string) => useToast.getState().show(message);

export function Toaster() {
  const message = useToast((s) => s.message);
  const key = useToast((s) => s.key);
  const clear = useToast((s) => s.clear);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2800);
    return () => clearTimeout(t);
  }, [message, key, clear]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <div key={key} className="toast">
          <span className="toast__dot" aria-hidden="true" />
          {message}
        </div>
      )}
    </div>
  );
}
