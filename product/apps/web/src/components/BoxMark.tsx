import { cn } from "@rookbox/ui-web";

/**
 * The Rookbox mark: a small machine with two eyes. Ink and paper follow the theme; the screen
 * line is the one green.
 */
export function BoxMark({ className, asleep = false }: { className?: string; asleep?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="8" className="fill-foreground" />
      {asleep ? (
        <path
          d="M9.5 15h5M17.5 15h5"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="stroke-background"
        />
      ) : (
        <>
          <circle cx="12" cy="14.5" r="2.4" className="fill-background" />
          <circle cx="20" cy="14.5" r="2.4" className="fill-background" />
        </>
      )}
      <path d="M10 22h12" strokeWidth="1.8" strokeLinecap="round" className="stroke-primary" />
    </svg>
  );
}
