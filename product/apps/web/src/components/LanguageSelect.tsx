import { useLingui } from "@lingui/react/macro";
import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rookbox/ui-web";
import { Globe } from "lucide-react";
import { setUiLocale } from "../lib/i18n";
import type { UiLocale } from "../lib/ui-locale";
import { normalizeUiLocale, UI_LOCALE_LABELS, UI_LOCALES } from "../lib/ui-locale";

const SHORT: Record<UiLocale, string> = { en: "EN", "pt-BR": "PT", es: "ES" };

/**
 * Picks the interface language: English, Português (Brasil) or Español. The choice is saved in
 * the browser and applies at once, with no reload. On a phone it shrinks to the globe and a code.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useLingui();
  const locale = normalizeUiLocale(i18n.locale);
  return (
    <Select
      items={UI_LOCALES.map((value) => ({ value, label: UI_LOCALE_LABELS[value] }))}
      value={locale}
      onValueChange={(value) => void setUiLocale(value as UiLocale)}
    >
      <SelectTrigger
        aria-label={t`Language`}
        className={cn("h-11 gap-2 rounded-[10px] px-3 text-body1 text-foreground", className)}
      >
        <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="hidden sm:inline">
          <SelectValue />
        </span>
        <span className="sm:hidden" aria-hidden="true">
          {SHORT[locale]}
        </span>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} className="min-w-48">
        {UI_LOCALES.map((value) => (
          <SelectItem key={value} value={value} lang={value}>
            {UI_LOCALE_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
