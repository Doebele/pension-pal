import { useEffect, useState } from "react";

// 1:1 aus Doebele/fintools (PORTFOLIO_COLORS) — kategoriale Chart-Palette
export const CHART_CATEGORICAL = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#6366f1",
] as const;

const FALLBACK_THEME_COLORS = {
  green: "#4ade80",
  red: "#f87171",
  yellow: "#fbbf24",
  accent: "#3b82f6",
  surface2: "#1a1b23",
  border: "rgba(255,255,255,0.10)",
  fg1: "#f0f1f5",
} as const;

// Values come from CSS variables at runtime, so plain strings (not the fallback literals)
export type ChartThemeColors = Record<keyof typeof FALLBACK_THEME_COLORS, string>;

function readChartThemeColors(): ChartThemeColors {
  if (typeof window === "undefined") return FALLBACK_THEME_COLORS;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    green: read("--green", FALLBACK_THEME_COLORS.green),
    red: read("--red", FALLBACK_THEME_COLORS.red),
    yellow: read("--yellow", FALLBACK_THEME_COLORS.yellow),
    accent: read("--accent", FALLBACK_THEME_COLORS.accent),
    surface2: read("--surface-2", FALLBACK_THEME_COLORS.surface2),
    border: read("--border", FALLBACK_THEME_COLORS.border),
    fg1: read("--fg-1", FALLBACK_THEME_COLORS.fg1),
  };
}

export function useChartThemeColors(): ChartThemeColors {
  const [colors, setColors] = useState<ChartThemeColors>(readChartThemeColors);

  useEffect(() => {
    setColors(readChartThemeColors());
    const observer = new MutationObserver(() => setColors(readChartThemeColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
