import type { ReactNode } from "react";

export function PageHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex min-h-9 flex-wrap items-center justify-between gap-3">
      <h1 className="text-heading2 font-semibold text-balance text-foreground">{title}</h1>
      {action}
    </header>
  );
}
