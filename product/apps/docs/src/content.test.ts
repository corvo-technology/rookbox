import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS = join(new URL(".", import.meta.url).pathname, "content", "docs");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const all = filesUnder(DOCS).map((path) => relative(DOCS, path));
const isEnglish = (path: string) => path.startsWith("en/");
const portuguese = all.filter((path) => !isEnglish(path));
const english = all.filter(isEnglish).map((path) => path.slice("en/".length));

// What must never appear in a page: wrong SDK setup and typographic dashes.
const BANNED = ["E2B_DOMAIN", "domain=", 'template="seed"', "—"];

describe("docs content", () => {
  it("has pages", () => {
    expect(portuguese.length).toBeGreaterThan(10);
  });

  it("gives every pt-BR page an English counterpart and the reverse", () => {
    expect(english.sort()).toEqual([...portuguese].sort());
  });

  it.each(all)("%s has a title and a description", (path) => {
    const text = readFileSync(join(DOCS, path), "utf8");
    expect(text).toMatch(/^---\ntitle: .+\ndescription: .+\n/);
  });

  it.each(all)("%s has none of the banned strings", (path) => {
    const text = readFileSync(join(DOCS, path), "utf8");
    for (const banned of BANNED) expect(text, banned).not.toContain(banned);
  });

  it("names the upstream project nowhere", () => {
    for (const path of all) {
      const text = readFileSync(join(DOCS, path), "utf8");
      expect(text, path).not.toMatch(/\bspace\b|perplexity/i);
    }
  });
});
