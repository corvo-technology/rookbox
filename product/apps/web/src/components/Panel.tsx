import { cn } from "@rookbox/ui-web";
import type { ReactNode } from "react";

/** A raised surface: hairline border, card fill, optional heading row. */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-5", className)}>
      {title ? (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="text-heading3 font-semibold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** "Sample data" and "Coming soon" tags. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border px-2.5 py-0.5 text-label font-semibold text-muted-foreground">
      {children}
    </span>
  );
}
