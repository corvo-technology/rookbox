import { I18nProvider } from "@lingui/react";
import { resolveAppearancePreference } from "@rookbox/ui-tokens";
import { Toaster, TooltipProvider } from "@rookbox/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { queryClient } from "./lib/api";
import { applyAppearance, watchSystemAppearance } from "./lib/appearance";
import { activateUiLocale, i18n } from "./lib/i18n";
import { resolveUiLocale } from "./lib/ui-locale";
import "./styles.css";

applyAppearance(resolveAppearancePreference());
watchSystemAppearance(() => resolveAppearancePreference());

await activateUiLocale(resolveUiLocale());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
