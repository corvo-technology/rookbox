import { Trans } from "@lingui/react/macro";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ApiKeysPage } from "./pages/ApiKeysPage";
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

export function App() {
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
