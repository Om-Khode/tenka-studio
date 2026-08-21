import { create } from "zustand";
import type { ActionResult } from "@/types/action";

export type Toast = ActionResult & { id: string };

/** Beyond four the stack covers the content it is reporting on. */
export const MAX_TOASTS = 4;

// Module-scoped and therefore reset-proof across store resets, which is what
// we want: ids must never collide within a session. Safe here because this
// store is NOT persisted -- see store/chat-store.ts for why a counter and
// persist do not mix.
let nextId = 0;

interface ToastState {
  toasts: Toast[];
  push: (result: ActionResult) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  push: (result) => {
    const id = `toast-${nextId++}`;
    set((state) => ({ toasts: [...state.toasts, { ...result, id }].slice(-MAX_TOASTS) }));
    return id;
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));
