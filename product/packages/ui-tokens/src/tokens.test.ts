import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  normalizeAppearancePreference,
  persistAppearancePreference,
  renderTokensCss,
  resolveAppearance,
  resolveAppearancePreference,
  UI_APPEARANCE_STORAGE_KEY,
  webDarkTokens,
  webLightTokens,
} from "./index.js";

describe("tokens", () => {
  it("keeps one green for the dark primary and ink for the light one", () => {
    expect(webDarkTokens.primary).toBe("#3FD6A8");
    expect(webLightTokens.primary).toBe("#0A0A0A");
  });

  it("keeps the committed tokens.css in step with the source", () => {
    const committed = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
    expect(committed).toBe(renderTokensCss());
  });

  it("follows the system when no theme is set", () => {
    const css = renderTokensCss();
    expect(css).toContain("@media (prefers-color-scheme: light)");
    expect(css).toContain(':root:not([data-theme="dark"])');
  });
});

describe("appearance preference", () => {
  it("defaults unknown values to system", () => {
    expect(normalizeAppearancePreference(null)).toBe("system");
    expect(normalizeAppearancePreference("nope")).toBe("system");
    expect(normalizeAppearancePreference("light")).toBe("light");
  });

  it("resolves system from the platform scheme", () => {
    expect(resolveAppearance("system", "light")).toBe("light");
    expect(resolveAppearance("dark", "light")).toBe("dark");
  });

  it("reads and writes storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    expect(resolveAppearancePreference({ storage })).toBe("system");
    persistAppearancePreference("light", storage);
    expect(store.get(UI_APPEARANCE_STORAGE_KEY)).toBe("light");
    expect(resolveAppearancePreference({ storage })).toBe("light");
  });
});
