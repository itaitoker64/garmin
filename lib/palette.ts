// Mirrors tailwind.config.ts colors — Recharts needs literal hex, not class names.
export const series = {
  blue: "#3987e5",
  aqua: "#199e70",
  yellow: "#c98500",
  green: "#008300",
  violet: "#9085e9",
  red: "#e66767",
  magenta: "#d55181",
  orange: "#d95926",
};

export const status = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export const chrome = {
  surface: "#1a1a19",
  plane: "#0d0d0d",
  primaryInk: "#ffffff",
  secondaryInk: "#c3c2b7",
  mutedInk: "#898781",
  gridline: "#2c2c2a",
  baseline: "#383835",
};

export function severityColor(sev: "good" | "watch" | "caution" | "unknown"): string {
  if (sev === "good") return status.good;
  if (sev === "watch") return status.warning;
  if (sev === "caution") return status.critical;
  return chrome.mutedInk;
}
