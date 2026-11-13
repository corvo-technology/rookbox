// Takes the review screenshots into product/.screenshots (gitignored). Start both apps first:
//   pnpm --filter @rookbox/www preview   (http://127.0.0.1:4321)
//   pnpm --filter @rookbox/web preview   (http://127.0.0.1:5173)
// Uses the locally installed Google Chrome, so no browser download is needed.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WWW = process.env.WWW_URL ?? "http://127.0.0.1:4321";
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:5173";
const out = fileURLToPath(new URL("../.screenshots/", import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });

async function page(colorScheme, width, height, locale = "en-US") {
  const context = await browser.newContext({
    colorScheme,
    viewport: { width, height },
    locale,
    deviceScaleFactor: 1,
  });
  const p = await context.newPage();
  // Reports a sideways scroll, the most common mobile layout bug.
  p.overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return p;
}

const saved = [];
async function shot(p, name, fullPage = true) {
  const path = `${out}${name}.png`;
  await p.screenshot({ path, fullPage });
  saved.push(path);
}

// The landing is light whatever the system says; check it in all three languages.
for (const [locale, path, browserLocale] of [
  ["en", "/", "en-US"],
  ["pt", "/pt/", "pt-BR"],
  ["es", "/es/", "es-ES"],
]) {
  for (const [device, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ]) {
    const p = await page("light", width, height, browserLocale);
    await p.goto(`${WWW}${path}`, { waitUntil: "networkidle" });
    await shot(p, `landing-${locale}-${device}-light`);
    const extra = await p.overflow();
    if (extra > 0) console.warn(`landing ${locale} ${device}: ${extra}px of sideways scroll`);
    await p.context().close();
  }
}

for (const scheme of ["dark", "light"]) {
  const p = await page(scheme, 1440, 900);
  await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
  await p.getByRole("link", { name: "build-runner" }).waitFor();
  await shot(p, `dashboard-machines-${scheme}`, false);

  await p.getByRole("button", { name: "New machine" }).click();
  await p.getByRole("dialog").waitFor();
  await p.getByText("Custom size").click();
  await p.waitForTimeout(300);
  await shot(p, `dashboard-create-dialog-${scheme}`, false);
  await p.keyboard.press("Escape");

  await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
  await p.getByRole("link", { name: "build-runner" }).click();
  await p.getByRole("heading", { name: "Specs" }).waitFor();
  await shot(p, `dashboard-machine-detail-${scheme}`);

  await p.goto(`${WEB}/usage`, { waitUntil: "networkidle" });
  await p.getByText("Machine hours and billing").waitFor();
  await shot(p, `dashboard-usage-${scheme}`);

  await p.goto(`${WEB}/keys`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Create key" }).first().click();
  await p.getByLabel("Name").fill("production");
  await p.getByRole("button", { name: "Create key" }).last().click();
  await p.getByText("Copy your key now").waitFor();
  await shot(p, `dashboard-api-key-created-${scheme}`, false);
  await p.getByRole("button", { name: "I have saved it" }).click();
  await p.waitForTimeout(300);
  await shot(p, `dashboard-api-keys-${scheme}`, false);
  await p.context().close();
}

// Phone width: the sidebar collapses behind the menu button.
for (const scheme of ["dark", "light"]) {
  const p = await page(scheme, 390, 844);
  await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
  await p.getByRole("link", { name: "build-runner" }).waitFor();
  await shot(p, `dashboard-machines-mobile-${scheme}`, false);
  const extra = await p.overflow();
  if (extra > 0) console.warn(`dashboard machines mobile ${scheme}: ${extra}px of sideways scroll`);
  await p.getByRole("button", { name: "Open menu" }).click();
  await shot(p, `dashboard-menu-mobile-${scheme}`, false);
  await p.context().close();
}

// pt-BR and es dashboards, in both themes and at phone width, to check the catalogs load and fit.
for (const [name, locale] of [
  ["pt-BR", "pt-BR"],
  ["es", "es-ES"],
]) {
  for (const scheme of ["dark", "light"]) {
    for (const [device, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const p = await page(scheme, width, height, locale);
      await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
      await p.getByRole("link", { name: "build-runner" }).waitFor();
      await shot(p, `dashboard-machines-${name}-${device}-${scheme}`, false);
      await p.goto(`${WEB}/usage`, { waitUntil: "networkidle" });
      await shot(p, `dashboard-usage-${name}-${device}-${scheme}`, false);
      const extra = await p.overflow();
      if (extra > 0) console.warn(`dashboard ${name} ${device} ${scheme}: ${extra}px of sideways scroll`);
      await p.context().close();
    }
  }
}

await browser.close();
console.log(saved.join("\n"));
