import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UiTheme = "dark" | "light";
export type UiDensity = "comfort" | "pro";
export type UiLanguage = "de" | "en";

export type UiPreferences = {
  theme: UiTheme;
  density: UiDensity;
  uiLanguage: UiLanguage;
  railOpen: boolean;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setDensity: (density: UiDensity) => void;
  toggleDensity: () => void;
  setUiLanguage: (language: UiLanguage) => void;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
};

export const useUiPreferencesStore = create<UiPreferences>()(
  persist(
    (set) => ({
      theme: "dark",
      density: "comfort",
      uiLanguage: "de",
      railOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setDensity: (density) => set({ density }),
      toggleDensity: () => set((s) => ({ density: s.density === "comfort" ? "pro" : "comfort" })),
      setUiLanguage: (uiLanguage) => set({ uiLanguage }),
      setRailOpen: (railOpen) => set({ railOpen }),
      toggleRail: () => set((s) => ({ railOpen: !s.railOpen })),
    }),
    {
      name: "pensionpal-ui-v1",
    },
  ),
);
