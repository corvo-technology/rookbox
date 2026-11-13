import { i18n } from "@lingui/core";
import type { UiLocale } from "./ui-locale";
import { persistUiLocale } from "./ui-locale";

export { i18n };

type CatalogModule = { messages: Parameters<typeof i18n.load>[1] };

const catalogs: Record<UiLocale, () => Promise<CatalogModule>> = {
  en: () => import("../locales/en/messages.po") as Promise<CatalogModule>,
  "pt-BR": () => import("../locales/pt-BR/messages.po") as Promise<CatalogModule>,
  es: () => import("../locales/es/messages.po") as Promise<CatalogModule>,
};

/** Loads only the chosen catalog and activates it. */
export async function activateUiLocale(locale: UiLocale): Promise<void> {
  const { messages } = await catalogs[locale]();
  i18n.load(locale, messages);
  i18n.activate(locale);
  document.documentElement.lang = locale;
}

export async function setUiLocale(locale: UiLocale): Promise<void> {
  persistUiLocale(locale);
  await activateUiLocale(locale);
}
