/**
 * Renders the social share images (public/og/{en,pt,es}.png, 1200x630) from scripts/og-template.tpl
 * with headless Chrome. Run `pnpm og` from apps/www after changing the template or the copy.
 *
 * Needs Chrome: set CHROME_PATH, or it tries the usual macOS/Linux locations. If ffmpeg is on the
 * PATH the PNGs are palette-quantized (flat colors, so the result is lossless in practice).
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { en } from "../src/i18n/copy/en";
import { es } from "../src/i18n/copy/es";
import { pt } from "../src/i18n/copy/pt";
import { LOCALE_HTML_LANG, type Locale } from "../src/i18n/locales";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COPIES = { en, pt, es } as const;
const DOMAIN = "box.rookbox.run";

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((path): path is string => Boolean(path) && existsSync(path as string));

if (!CHROME) throw new Error("Chrome not found. Set CHROME_PATH.");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const template = readFileSync(join(ROOT, "scripts/og-template.tpl"), "utf8");
const fontUrl = pathToFileURL(join(ROOT, "public/fonts/instrument-sans-latin.woff2")).href;
const work = mkdtempSync(join(tmpdir(), "rookbox-og-"));
mkdirSync(join(ROOT, "public/og"), { recursive: true });

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

for (const locale of Object.keys(COPIES) as Locale[]) {
  const copy = COPIES[locale];
  const values: Record<string, string> = {
    lang: LOCALE_HTML_LANG[locale],
    fontUrl,
    title: copy.hero.title,
    e2b: copy.nav.e2b,
    terminalLabel: copy.demo.terminalLabel,
    ready: copy.demo.session.ready,
    running: copy.visual.running,
    domain: DOMAIN,
  };
  const html = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Unknown template key ${key}`);
    return key === "fontUrl" ? values[key] : escapeHtml(values[key]);
  });
  const page = join(work, `${locale}.html`);
  const raw = join(work, `${locale}.png`);
  const out = join(ROOT, `public/og/${locale}.png`);
  writeFileSync(page, html);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      "--virtual-time-budget=3000",
      `--screenshot=${raw}`,
      pathToFileURL(page).href,
    ],
    { stdio: "ignore" },
  );
  if (hasFfmpeg) {
    const small = join(work, `${locale}.small.png`);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      raw,
      "-vf",
      "split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none",
      small,
    ]);
    renameSync(small, out);
  } else {
    renameSync(raw, out);
  }
  console.log(`wrote public/og/${locale}.png`);
}
