import { create } from 'zustand';

/**
 * DIRECTIVE-021 Stage 10.2 — v3 shift UI state.
 *
 * `ShiftLifecycle` is a pure, testable state machine for the drawer UI:
 * NONE → OPENING → ACTIVE → CLOSING → ACTIVE (exact close) / NONE is
 * impossible — close always lands back with no active shift, so CLOSING
 * resolves to NONE. The zustand store only holds the register pointer
 * and modal flags; server truth lives in react-query (`shiftV3Hooks`).
 */

export type ShiftLifecycle = 'NONE' | 'OPENING' | 'ACTIVE' | 'CLOSING';

export type ShiftLifecycleEvent =
  | { type: 'BEGIN_OPEN' }
  | { type: 'OPENED' }
  | { type: 'BEGIN_CLOSE' }
  | { type: 'CLOSED' }
  | { type: 'CANCEL' };

export function nextShiftLifecycle(current: ShiftLifecycle, event: ShiftLifecycleEvent): ShiftLifecycle {
  switch (event.type) {
    case 'BEGIN_OPEN':
      return current === 'NONE' ? 'OPENING' : current;
    case 'OPENED':
      return current === 'OPENING' ? 'ACTIVE' : current;
    case 'BEGIN_CLOSE':
      return current === 'ACTIVE' ? 'CLOSING' : current;
    case 'CLOSED':
      return current === 'CLOSING' ? 'NONE' : current;
    case 'CANCEL':
      return current === 'OPENING' || current === 'CLOSING' ? (current === 'OPENING' ? 'NONE' : 'ACTIVE') : current;
  }
}

const REGISTER_KEY = 'baraka_v3_register_id';

function initialRegisterId(): string | null {
  try {
    return localStorage.getItem(REGISTER_KEY);
  } catch {
    return null;
  }
}

type ShiftUiState = {
  registerId: string | null;
  setRegisterId: (id: string | null) => void;
  openModalOpen: boolean;
  setOpenModalOpen: (v: boolean) => void;
  closeModalOpen: boolean;
  setCloseModalOpen: (v: boolean) => void;
};

export const useShiftUiStore = create<ShiftUiState>((set) => ({
  registerId: initialRegisterId(),
  setRegisterId: (id) => {
    try {
      if (id) localStorage.setItem(REGISTER_KEY, id);
      else localStorage.removeItem(REGISTER_KEY);
    } catch {
      /* private mode — session-only */
    }
    set({ registerId: id });
  },
  openModalOpen: false,
  setOpenModalOpen: (v) => set({ openModalOpen: v }),
  closeModalOpen: false,
  setCloseModalOpen: (v) => set({ closeModalOpen: v }),
}));
