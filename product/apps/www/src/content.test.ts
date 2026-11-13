import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./i18n/copy/en";
import { es } from "./i18n/copy/es";
import { pt } from "./i18n/copy/pt";
import { buildE2bSnippets, buildQuickstart, buildSessions } from "./snippets";

const COPIES = { en, pt, es };

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

// The name of the open-source base is not shown anywhere on the public landing.
const BANNED = /\bspace\b|perplexity|apache/i;
const HERE = new URL(".", import.meta.url).pathname;

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path, keep) : keep(name) ? [path] : [];
  });
}

describe("landing copy", () => {
  it.each(Object.entries(COPIES))("%s never names the upstream project", (_, copy) => {
    for (const text of strings(copy)) expect(text).not.toMatch(BANNED);
  });

  it("does not name the upstream project in the page sources", () => {
    const sources = filesUnder(HERE, (n) => /\.(ts|tsx|astro)$/.test(n) && n !== "content.test.ts");
    for (const file of sources) expect(readFileSync(file, "utf8"), file).not.toMatch(BANNED);
  });

  it("does not name the upstream project in the built pages, when a build exists", () => {
    const dist = join(HERE, "../dist");
    if (!existsSync(dist)) return;
    for (const file of filesUnder(dist, (n) => /\.(html|xml|txt)$/.test(n))) {
      // Visible text, meta tags, JSON-LD and alt text all live in the markup; CSS is not scanned.
      const markup = readFileSync(file, "utf8").replace(/<style[\s\S]*?<\/style>/g, "");
      expect(markup, file).not.toMatch(BANNED);
    }
  });

  it.each(Object.entries(COPIES))("%s has no bracket placeholders or example hosts", (_, copy) => {
    for (const text of strings(copy)) {
      expect(text).not.toMatch(/\[[^\]]*\]/);
      expect(text).not.toMatch(/example\.(com|org)/);
    }
  });

  it("has the same shape in every language", () => {
    const keys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(keys)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keys(v)]))
          : typeof value;
    expect(keys(pt)).toEqual(keys(en));
    expect(keys(es)).toEqual(keys(en));
    expect(pt.demo.steps).toHaveLength(en.demo.steps.length);
    expect(es.features.items).toHaveLength(en.features.items.length);
    expect(pt.quickstart.steps).toHaveLength(5);
    expect(es.quickstart.steps).toHaveLength(5);
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

  it("covers every demo step, with one resume line per language", () => {
    const sessions = buildSessions("box.rookbox.run", en.demo.session);
    for (const lines of Object.values(sessions)) {
      expect(new Set(lines.map(([step]) => step)).size).toBe(en.demo.steps.length);
      expect(lines.some(([, text]) => text.includes("connect("))).toBe(true);
    }
  });

  it("has one quickstart block per step and only the E2B package", () => {
    const { py, ts } = buildQuickstart("box.rookbox.run");
    expect(py).toHaveLength(en.quickstart.steps.length);
    expect(ts).toHaveLength(en.quickstart.steps.length);
    expect(py[0]).toBe("pip install e2b");
    expect(ts[0]).toBe("npm install e2b");
    expect(py[1]).toContain("E2B_DOMAIN=box.rookbox.run");
  });
});
