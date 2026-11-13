import { describe, expect, it } from "vitest";
import { en } from "./i18n/copy/en";
import { es } from "./i18n/copy/es";
import { pt } from "./i18n/copy/pt";
import { buildE2bSnippets, buildSessions } from "./snippets";

const COPIES = { en, pt, es };

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("landing copy", () => {
  it.each(Object.entries(COPIES))("%s has no bracket placeholders or example hosts", (_, copy) => {
    for (const text of strings(copy)) {
      expect(text).not.toMatch(/\[[^\]]*\]/);
      expect(text).not.toMatch(/example\.(com|org)/);
    }
  });

  it("has the same shape in every language", () => {
    const shape = (copy: object) => JSON.stringify(Object.keys(copy));
    expect(shape(pt)).toBe(shape(en));
    expect(shape(es)).toBe(shape(en));
    expect(pt.demo.steps).toHaveLength(en.demo.steps.length);
    expect(es.features.items).toHaveLength(en.features.items.length);
  });
});

describe("snippets", () => {
  it("changes only the domain line in the E2B before/after", () => {
    const { py, ts } = buildE2bSnippets("box.rookbox.run");
    expect(py.after).toContain('domain="box.rookbox.run"');
    expect(ts.after).toContain('domain: "box.rookbox.run"');
    expect(py.before).not.toContain("domain");
    expect(ts.before).not.toContain("domain");
    const without = (text: string) => text.split("\n").filter((l) => !l.includes("domain"));
    expect(without(py.after).length).toBe(py.before.split("\n").length);
    expect(without(ts.after).length).toBe(ts.before.split("\n").length);
  });

  it("uses the given domain in the sample session and has no CLI tab", () => {
    const sessions = buildSessions("box.rookbox.run", en.demo.session);
    expect(Object.keys(sessions)).toEqual(["py", "ts"]);
    for (const lines of Object.values(sessions)) {
      expect(lines.some(([, text]) => text.endsWith(".box.rookbox.run"))).toBe(true);
    }
  });
});
