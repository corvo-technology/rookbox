import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
    expect(es.demo.steps).toHaveLength(en.demo.steps.length);
  });

  it.each(Object.entries(COPIES))("%s has no em dashes and keeps the owner's cuts", (_, copy) => {
    for (const text of strings(copy)) {
      expect(text).not.toContain("\u2014");
      expect(text).not.toMatch(
        /iof|ainda não disponível|not yet available|only by invitation|só por convite/i,
      );
    }
  });
});

describe("interactive labels", () => {
  it.each(Object.entries(COPIES))(
    "%s names the copy button, its confirmation and the tags",
    (_, copy) => {
      for (const label of Object.values(copy.ui)) expect(label.trim().length).toBeGreaterThan(1);
      expect(copy.ui.copy).not.toBe(copy.ui.copied);
    },
  );

  it("keeps the demo's height fixed: every session line is rendered up front", () => {
    const source = readFileSync(join(HERE, "components/Demo.astro"), "utf8");
    expect(source).toContain("sessions[tab.id].map");
    expect(source).not.toMatch(/\shidden[\s=>]|display:\s*none/);
  });
});

describe("snippets", () => {
  it("changes only the environment for E2B, and never asks for E2B_DOMAIN or a template", () => {
    const { env, code } = buildE2bSnippets("https://api.rookbox.run");
    expect(env.before).toBe("E2B_API_KEY=e2b_...");
    expect(env.after).toContain("E2B_API_KEY=rbx_...");
    expect(env.after).toContain("E2B_API_URL=https://api.rookbox.run");
    for (const text of [env.before, env.after, code.py, code.ts]) {
      expect(text).not.toMatch(/E2B_DOMAIN|domain|seed/);
    }
    expect(code.py).toContain("Sandbox.create()");
    expect(code.ts).toContain("Sandbox.create()");
  });

  it("uses the given domain in the sample session and has no CLI tab", () => {
    const sessions = buildSessions("box.rookbox.run", en.demo.session);
    expect(Object.keys(sessions)).toEqual(["py", "ts"]);
    for (const lines of Object.values(sessions)) {
      expect(lines.some(([, text]) => text.endsWith(".box.rookbox.run"))).toBe(true);
      expect(lines.every(([, text]) => !text.includes("seed"))).toBe(true);
    }
  });

  it("covers every demo step, with one resume line per language", () => {
    const sessions = buildSessions("box.rookbox.run", en.demo.session);
    for (const lines of Object.values(sessions)) {
      expect(new Set(lines.map(([step]) => step)).size).toBe(en.demo.steps.length);
      expect(lines.some(([, text]) => text.includes("connect("))).toBe(true);
    }
  });
});

describe("share images", () => {
  const PUBLIC = join(HERE, "../public");

  it.each(["en", "pt", "es"])("has a 1200x630 PNG for %s under 300 KB", (locale) => {
    const file = join(PUBLIC, "og", `${locale}.png`);
    expect(existsSync(file), file).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    // IHDR: width and height are the first two big-endian uint32 after the chunk header.
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes.length).toBeLessThan(300 * 1024);
  });

  it("keeps the x-default fallback the same size", () => {
    const bytes = readFileSync(join(PUBLIC, "og.png"));
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
