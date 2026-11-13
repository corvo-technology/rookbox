import { cn } from "@rookbox/ui-web";

/**
 * The "Gate" mark: a rook silhouette with three merlons, one thin cut line under the crown and
 * the doorway cut out. Flat and monochrome: it takes the text colour, so it is black on paper
 * and white on ink, and nothing in it is green. Drawn on a 64 by 64 grid; the cut line is real
 * empty space, so the mark works on any background.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("size-[1.2em] shrink-0", className)}
      fill="currentColor"
      fillRule="evenodd"
    >
      {/* Crown: three merlons, above the cut line. */}
      <path d="M16 12h8v7h4v-7h8v7h4v-7h8v10.5H16z" />
      {/* Tower body, below the cut line, with the doorway cut out of it. */}
      <path d="M16 25.3h32V52H16z M27 52V40a5 5 0 0 1 10 0v12z" />
    </svg>
  );
}

/**
 * THE logo for the dashboard: the mark and the wordmark "Rookbox" (Instrument Sans 700, tracking
 * -0.055em). Size it with a text size class; the mark follows. `markOnly` is for tight spots.
 *
 * Swap point for the logo: replace this file and public/favicon.svg. Nothing else draws the brand.
 */
export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center gap-[0.38em] text-[20px] leading-none font-bold tracking-[-0.055em] text-foreground",
        className,
      )}
    >
      <LogoMark />
      {markOnly ? null : <span>Rookbox</span>}
    </span>
  );
}
