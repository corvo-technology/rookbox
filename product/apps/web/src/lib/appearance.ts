import type { AppearancePreference } from "@rookbox/ui-tokens";
import { persistAppearancePreference, resolveAppearance } from "@rookbox/ui-tokens";

function systemAppearance() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Same rule as public/theme.js, which runs before first paint. */
export function applyAppearance(preference: AppearancePreference): void {
  const theme = resolveAppearance(preference, systemAppearance());
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function setAppearance(preference: AppearancePreference): void {
  persistAppearancePreference(preference);
  applyAppearance(preference);
}

/** Follows the system while the preference is "system". */
export function watchSystemAppearance(current: () => AppearancePreference): () => void {
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (current() === "system") applyAppearance("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
