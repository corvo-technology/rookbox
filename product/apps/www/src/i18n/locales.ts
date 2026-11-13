/** The languages the dashboard speaks, so a visitor finds the same one inside. */
export const LOCALES = ["en", "pt", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  pt: "Português",
  es: "Español",
};

export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: "en",
  pt: "pt-BR",
  es: "es",
};

export const LOCALE_OG: Record<Locale, string> = {
  en: "en_US",
  pt: "pt_BR",
  es: "es_ES",
};

/** BCP 47 tags shared by page hreflang links and the sitemap. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
};

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

export function localeHomePath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}/`;
}
