import type { ReactNode } from "react";

export function PageHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex min-h-11 flex-wrap items-center justify-between gap-3.5">
      <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.03em] text-balance text-foreground">
        {title}
      </h1>
      {action}
    </header>
  );
}
