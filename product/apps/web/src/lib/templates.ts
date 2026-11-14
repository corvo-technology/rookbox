/** What a person calls a template, by the kind of machine it makes. */
export type TemplateKind = "desktop" | "linux";

const KINDS: Record<string, TemplateKind> = {
  desktop: "desktop",
  "desktop-v2": "desktop",
  "corvo-computer": "desktop",
  "corvo-computer-v2": "desktop",
  seed: "linux",
};

/** The kind for a known internal template name, or `null` so the caller shows the raw name. */
export function templateKind(name: string): TemplateKind | null {
  return Object.hasOwn(KINDS, name) ? (KINDS[name] ?? null) : null;
}
