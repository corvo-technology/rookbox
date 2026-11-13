import { cn } from "@rookbox/ui-web";

/**
 * THE logo for the dashboard. The owner has not chosen a mark yet, so this is a neutral
 * placeholder: the plain monochrome "Rookbox" wordmark (Instrument Sans 700, tracking -0.055em),
 * no symbol.
 *
 * Swap point for the logo: replace this file and public/favicon.svg. Nothing else draws the brand.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block text-[20px] leading-none font-bold tracking-[-0.055em] text-foreground",
        className,
      )}
    >
      Rookbox
    </span>
  );
}
