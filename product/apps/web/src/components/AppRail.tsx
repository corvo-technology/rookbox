import { useLingui } from "@lingui/react/macro";
import { cn } from "@rookbox/ui-web";
import type { LucideIcon } from "lucide-react";
import { ChartColumn, KeyRound, Server, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { BoxMark } from "./BoxMark";

function RailLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex w-15 flex-col items-center gap-1 rounded-xl py-2 text-caption font-medium text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          isActive && "bg-sidebar-accent text-foreground",
        )
      }
    >
      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
      <span className="max-w-full truncate px-0.5">{label}</span>
    </NavLink>
  );
}

/** The main navigation: 76 pixels wide, a name under every icon. */
export function AppRail() {
  const { t } = useLingui();
  return (
    <nav
      aria-label={t`Main`}
      className="flex w-19 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-4"
    >
      <NavLink to="/machines" aria-label={t`Rook Box home`} className="mb-4 rounded-lg">
        <BoxMark className="size-8" />
      </NavLink>
      <RailLink to="/machines" icon={Server} label={t`Machines`} />
      <RailLink to="/keys" icon={KeyRound} label={t`API keys`} />
      <RailLink to="/usage" icon={ChartColumn} label={t`Usage`} />
      <div className="mt-auto">
        <RailLink to="/settings" icon={Settings} label={t`Settings`} />
      </div>
    </nav>
  );
}
