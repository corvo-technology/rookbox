import { Trans } from "@lingui/react/macro";
import { Button, Spinner } from "@rookbox/ui-web";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorNote } from "./components/ErrorNote";
import { LanguageSelect } from "./components/LanguageSelect";
import { Logo } from "./components/Logo";
import { AUTH_ENABLED, useSession } from "./lib/auth";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { LoginPage } from "./pages/LoginPage";
import { MachinePage } from "./pages/MachinePage";
import { MachinesPage } from "./pages/MachinesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsagePage } from "./pages/UsagePage";

function NotFound() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-heading2 font-semibold text-foreground">
        <Trans>Page not found</Trans>
      </h1>
      <Link to="/machines" className="text-body1 text-link underline-offset-4 hover:underline">
        <Trans>Go to machines</Trans>
      </Link>
    </div>
  );
}

/** Before the first answer about who is signed in. */
function Starting() {
  return (
    <div className="grid min-h-full place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <Logo className="text-[26px]" />
        <Spinner aria-hidden="true" />
        <span className="sr-only">
          <Trans>Loading</Trans>
        </span>
      </div>
    </div>
  );
}

/** The API did not answer, which is not the same as being signed out. */
function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-15 items-center justify-between px-3 md:px-5">
        <Logo />
        <LanguageSelect />
      </header>
      <main className="grid flex-1 place-items-center px-4 pb-16">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <ErrorNote error={new TypeError("unreachable")} />
          <Button className="h-11 w-fit px-4 text-body1 font-semibold" onClick={onRetry}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      </main>
    </div>
  );
}

export function App() {
  const session = useSession();
  // With the real API, nothing but the sign-in screen shows until there is a session.
  if (AUTH_ENABLED && session.isPending) return <Starting />;
  if (AUTH_ENABLED && session.isError && !session.data)
    return <Unreachable onRetry={() => session.refetch()} />;
  if (AUTH_ENABLED && !session.data) return <LoginPage />;
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-7">
        <Routes>
          <Route path="/" element={<Navigate to="/machines" replace />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/machines/:id" element={<MachinePage />} />
          <Route path="/keys" element={<ApiKeysPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </AppShell>
  );
}
