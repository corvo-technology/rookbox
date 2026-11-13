import { Trans, useLingui } from "@lingui/react/macro";
import { Button, buttonVariants, cn } from "@rookbox/ui-web";
import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  ChevronDown,
  GitBranch,
  KeyRound,
  Layers,
  Lock,
  Menu,
  Moon,
  Search,
  Server,
  Settings,
  Sun,
  Unplug,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { setAppearance } from "../lib/appearance";
import { DOCS_URL, FILTER_INPUT_ID } from "../lib/site";
import { Logo } from "./Logo";

type NavItem = { icon: LucideIcon; label: string; to?: string };

function useNav(): { heading?: string; items: NavItem[] }[] {
  const { t } = useLingui();
  return [
    {
      items: [
        { icon: Server, label: t`Machines`, to: "/machines" },
        { icon: Layers, label: t`Snapshots` },
        { icon: Lock, label: t`Secrets` },
        { icon: KeyRound, label: t`API keys`, to: "/keys" },
      ],
    },
    {
      heading: t`Integrations`,
      items: [
        { icon: Unplug, label: t`Webhooks` },
        { icon: GitBranch, label: t`CI` },
      ],
    },
    {
      heading: t`Workspace`,
      items: [
        { icon: Users, label: t`Members` },
        { icon: ChartColumn, label: t`Usage and billing`, to: "/usage" },
        { icon: Settings, label: t`Settings`, to: "/settings" },
      ],
    },
  ];
}

const ITEM =
  "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-body1 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function SidebarItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  if (!item.to) {
    return (
      <span aria-disabled="true" className={cn(ITEM, "cursor-not-allowed text-faint-foreground")}>
        <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
        {item.label}
        <span className="ml-auto rounded-full border border-border px-2 py-px text-caption font-semibold">
          <Trans>Soon</Trans>
        </span>
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          ITEM,
          "text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
          isActive && "bg-sidebar-accent font-semibold text-foreground [&_svg]:text-link",
        )
      }
    >
      <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLingui();
  const groups = useNav();
  const navigate = useNavigate();
  const shortcut = isMac() ? "⌘ K" : "Ctrl K";

  const search = () => {
    navigate("/machines");
    onNavigate?.();
    window.setTimeout(() => document.getElementById(FILTER_INPUT_ID)?.focus(), 60);
  };

  return (
    <nav aria-label={t`Workspace`} className="flex min-h-full flex-col gap-0.5 p-3">
      <button
        type="button"
        onClick={search}
        className="mb-2.5 flex min-h-11 w-full items-center gap-2.5 rounded-[10px] border border-border px-3 text-body1 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Search className="size-4" aria-hidden="true" />
        <Trans>Search</Trans>
        <kbd className="ml-auto rounded-md border border-border px-1.5 py-px text-label font-semibold">
          {shortcut}
        </kbd>
      </button>
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col gap-0.5">
          {group.heading ? (
            <p className="px-3 pt-4 pb-1.5 text-label font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {group.heading}
            </p>
          ) : null}
          {group.items.map((item) => (
            <SidebarItem key={item.label} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4 max-md:mt-6">
        {/* Placeholders: the plan and its limits are not defined yet. */}
        <p className="text-body2 text-muted-foreground">
          <Trans>[PLAN NAME] plan. [LIMIT] machines running of [LIMIT].</Trans>
        </p>
        <Link
          to="/usage"
          onClick={onNavigate}
          className={cn(buttonVariants({ variant: "default" }), "h-11 w-full text-body1")}
        >
          <Trans>Upgrade plan</Trans>
        </Link>
      </div>
    </nav>
  );
}

function ThemeToggle() {
  const { t } = useLingui();
  const read = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const [theme, setTheme] = useState<"light" | "dark">(read);
  const next = theme === "light" ? "dark" : "light";
  return (
    <Button
      variant="ghost"
      className="size-11 text-muted-foreground"
      aria-label={theme === "light" ? t`Switch to dark theme` : t`Switch to light theme`}
      onClick={() => {
        setAppearance(next);
        setTheme(next);
      }}
    >
      {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </Button>
  );
}

function TopBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const { t } = useLingui();
  return (
    <header className="flex h-15 shrink-0 items-center gap-3 border-b border-border bg-background px-3 md:px-5">
      <Button
        variant="ghost"
        className="size-11 text-muted-foreground md:hidden"
        aria-label={menuOpen ? t`Close menu` : t`Open menu`}
        aria-expanded={menuOpen}
        onClick={onMenu}
      >
        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </Button>
      <Link to="/machines" aria-label={t`Rookbox home`} className="rounded-lg">
        <Logo />
      </Link>
      <span aria-hidden="true" className="text-muted-foreground max-sm:hidden">
        /
      </span>
      {/* Placeholder: workspaces do not exist yet, so the switcher is inert. */}
      <button
        type="button"
        disabled
        aria-label={t`Workspace switcher, coming soon`}
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-border px-3 text-body1 font-semibold text-foreground opacity-80 max-sm:hidden"
      >
        [Workspace]
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </button>
      <span className="flex-1" />
      <a
        href={DOCS_URL}
        className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-body1 text-muted-foreground hover:bg-accent hover:text-foreground max-sm:hidden"
      >
        <Trans>Docs</Trans>
      </a>
      <ThemeToggle />
      <Link
        to="/settings"
        aria-label={t`Settings`}
        className="grid size-[34px] place-items-center rounded-full border border-border bg-card text-label font-semibold text-foreground"
      >
        [U]
      </Link>
    </header>
  );
}

/** The top bar and the sidebar. On a phone the sidebar opens from the menu button. */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/machines");
        window.setTimeout(() => document.getElementById(FILTER_INPUT_ID)?.focus(), 60);
      }
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="flex h-full flex-col">
      <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen((open) => !open)} />
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar md:block">
          <Sidebar />
        </aside>
        {menuOpen ? (
          <aside className="absolute inset-0 z-30 overflow-y-auto bg-sidebar md:hidden">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        ) : null}
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
