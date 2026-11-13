import { describe, expect, it } from "vitest";
import { normalizeUiLocale, resolveUiLocale, UI_LOCALE_STORAGE_KEY } from "./ui-locale";

describe("ui locale", () => {
  it("matches regional tags by language", () => {
    expect(normalizeUiLocale("pt-PT")).toBe("pt-BR");
    expect(normalizeUiLocale("es-MX")).toBe("es");
    expect(normalizeUiLocale("en-GB")).toBe("en");
    expect(normalizeUiLocale("de-DE")).toBe("en");
    expect(normalizeUiLocale(null)).toBe("en");
  });

  it("prefers a saved choice over the browser language", () => {
    const storage = { getItem: (key: string) => (key === UI_LOCALE_STORAGE_KEY ? "es" : null) };
    expect(resolveUiLocale({ storage, navigatorLanguage: "pt-BR" })).toBe("es");
    expect(resolveUiLocale({ storage: null, navigatorLanguage: "pt-BR" })).toBe("pt-BR");
  });
});
