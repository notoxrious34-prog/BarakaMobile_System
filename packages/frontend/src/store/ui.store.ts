import { create } from 'zustand';

const SIDEBAR_KEY = 'baraka_sidebar_collapsed';

function initialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
  setMobileNavOpen: (v: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: initialCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* private mode — session-only */
      }
      return { sidebarCollapsed: next };
    }),
  setSidebarCollapsed: (v) => {
    try {
      localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0');
    } catch {
      /* private mode — session-only */
    }
    set({ sidebarCollapsed: v });
  },
  mobileNavOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
}));
