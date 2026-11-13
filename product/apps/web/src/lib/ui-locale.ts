export const UI_LOCALES = ["en", "pt-BR", "es"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const UI_LOCALE_STORAGE_KEY = "rookbox.uiLocale";

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  en: "English",
  "pt-BR": "Português (Brasil)",
  es: "Español",
};

/** Matches a BCP 47 tag (`pt-PT`, `es-MX`, `en-GB`) to a supported locale by language, else `en`. */
export function normalizeUiLocale(raw: string | null | undefined): UiLocale {
  const language = raw?.trim().toLowerCase().split(/[-_]/)[0];
  if (language === "pt") return "pt-BR";
  if (language === "es") return "es";
  return "en";
}

type Sources = {
  storage?: Pick<Storage, "getItem"> | null;
  navigatorLanguage?: string | null;
};

/** Saved choice, then the browser's language, then English. */
export function resolveUiLocale(sources: Sources = {}): UiLocale {
  const storage =
    sources.storage !== undefined
      ? sources.storage
      : typeof localStorage !== "undefined"
        ? localStorage
        : null;
  let stored: string | null = null;
  try {
    stored = storage?.getItem(UI_LOCALE_STORAGE_KEY) ?? null;
  } catch {
    stored = null;
  }
  if (stored) return normalizeUiLocale(stored);
  const language =
    sources.navigatorLanguage !== undefined
      ? sources.navigatorLanguage
      : typeof navigator !== "undefined"
        ? navigator.language
        : null;
  return normalizeUiLocale(language);
}

export function persistUiLocale(locale: UiLocale): void {
  try {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode or a full quota: the choice still applies until reload.
  }
}
