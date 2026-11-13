import { cn } from "@rookbox/ui-web";

/** A small set of mutually exclusive choices drawn as one pill group (filters, periods). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as an inline pill group
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-xl border border-border p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-9 rounded-lg px-3.5 text-body2 font-semibold text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            option.value === value &&
              "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
