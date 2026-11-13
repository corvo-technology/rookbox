import { Trans, useLingui } from "@lingui/react/macro";
import type { AppearancePreference } from "@rookbox/ui-tokens";
import { APPEARANCE_PREFERENCES, resolveAppearancePreference } from "@rookbox/ui-tokens";
import {
  Button,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rookbox/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { setAppearance } from "../lib/appearance";
import { AUTH_ENABLED, SESSION_KEY, signOut, useSession } from "../lib/auth";
import { setUiLocale } from "../lib/i18n";
import type { UiLocale } from "../lib/ui-locale";
import { normalizeUiLocale, UI_LOCALE_LABELS, UI_LOCALES } from "../lib/ui-locale";

export function SettingsPage() {
  const { t, i18n } = useLingui();
  const [appearance, setAppearanceState] = useState<AppearancePreference>(() =>
    resolveAppearancePreference(),
  );
  const locale = normalizeUiLocale(i18n.locale);
  const appearanceLabels: Record<AppearancePreference, string> = {
    system: t`System`,
    light: t`Light`,
    dark: t`Dark`,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={<Trans>Settings</Trans>} />
      <div className="flex max-w-sm flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="settings-language">
            <Trans>Language</Trans>
          </FieldLabel>
          <Select
            items={UI_LOCALES.map((value) => ({ value, label: UI_LOCALE_LABELS[value] }))}
            value={locale}
            onValueChange={(value) => void setUiLocale(value as UiLocale)}
          >
            <SelectTrigger id="settings-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_LOCALES.map((value) => (
                <SelectItem key={value} value={value}>
                  {UI_LOCALE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="settings-appearance">
            <Trans>Appearance</Trans>
          </FieldLabel>
          <Select
            items={APPEARANCE_PREFERENCES.map((value) => ({
              value,
              label: appearanceLabels[value],
            }))}
            value={appearance}
            onValueChange={(value) => {
              const next = value as AppearancePreference;
              setAppearanceState(next);
              setAppearance(next);
            }}
          >
            <SelectTrigger id="settings-appearance" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPEARANCE_PREFERENCES.map((value) => (
                <SelectItem key={value} value={value}>
                  {appearanceLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {AUTH_ENABLED ? <Account /> : null}
      </div>
    </div>
  );
}

/** Who is signed in, and the way out. Only with the real API: the fake has no accounts. */
function Account() {
  const queryClient = useQueryClient();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-body1 font-semibold">
        <Trans>Account</Trans>
      </h2>
      <p className="text-body1 text-muted-foreground">
        <Trans>Signed in as</Trans> <span className="text-foreground">{session.data?.email}</span>
      </p>
      <Button
        variant="outline"
        className="h-11 w-fit px-[18px] text-body1 font-semibold"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
          queryClient.clear();
          queryClient.setQueryData(SESSION_KEY, null);
          setBusy(false);
        }}
      >
        <Trans>Sign out</Trans>
      </Button>
    </section>
  );
}
