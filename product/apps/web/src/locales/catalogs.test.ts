import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UI_LOCALES } from "../lib/ui-locale";

function entries(locale: string) {
  const text = readFileSync(new URL(`./${locale}/messages.po`, import.meta.url), "utf8");
  return text.split(/\n\n+/).flatMap((block) => {
    const id = [...block.matchAll(/^msgid ((?:".*"\n?)+)/gm)].map((m) => m[1] ?? "");
    const str = [...block.matchAll(/^msgstr ((?:".*"\n?)+)/gm)].map((m) => m[1] ?? "");
    const join = (raw: string) =>
      raw
        .split("\n")
        .map((line) => line.replace(/^"|"$/g, ""))
        .join("");
    return id.length && str.length ? [{ id: join(id[0] ?? ""), str: join(str[0] ?? "") }] : [];
  });
}

describe("message catalogs", () => {
  it.each(UI_LOCALES)("%s never names the underlying project", (locale) => {
    for (const { id, str } of entries(locale)) {
      expect(id, `msgid: ${id}`).not.toMatch(/\bSPACE\b/);
      expect(str, `msgstr for: ${id}`).not.toMatch(/\bSPACE\b/);
    }
  });

  it.each(UI_LOCALES)("%s translates every message", (locale) => {
    const missing = entries(locale).filter(({ id, str }) => id !== "" && str === "");
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });
});
