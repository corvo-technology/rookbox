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
  return context.newPage();
}

const saved = [];
async function shot(p, name, fullPage = true) {
  const path = `${out}${name}.png`;
  await p.screenshot({ path, fullPage });
  saved.push(path);
}

for (const [locale, path] of [
  ["en", "/"],
  ["pt", "/pt/"],
]) {
  for (const scheme of ["dark", "light"]) {
    for (const [device, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ]) {
      const p = await page(scheme, width, height);
      await p.goto(`${WWW}${path}`, { waitUntil: "networkidle" });
      await shot(p, `landing-${locale}-${device}-${scheme}`);
      await p.context().close();
    }
  }
}

for (const scheme of ["dark", "light"]) {
  const p = await page(scheme, 1280, 800);
  await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
  await p.getByRole("link", { name: "build-runner" }).waitFor();
  await shot(p, `dashboard-machines-${scheme}`, false);

  await p.getByRole("button", { name: "New machine" }).click();
  await p.getByRole("dialog").waitFor();
  await p.getByText("Advanced").click();
  await p.waitForTimeout(300);
  await shot(p, `dashboard-create-dialog-${scheme}`, false);
  await p.keyboard.press("Escape");

  await p.goto(`${WEB}/keys`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "New key" }).click();
  await p.getByLabel("Name").fill("production");
  await p.getByRole("button", { name: "Create key" }).click();
  await p.getByText("Copy your key").waitFor();
  await shot(p, `dashboard-api-key-created-${scheme}`, false);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await shot(p, `dashboard-api-keys-${scheme}`, false);

  if (scheme === "dark") {
    await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
    await p.getByRole("link", { name: "build-runner" }).click();
    await p.getByRole("heading", { name: "Connect" }).waitFor();
    await shot(p, "dashboard-machine-detail-dark", false);
    await p.goto(`${WEB}/usage`, { waitUntil: "networkidle" });
    await p.getByText("Sample data").waitFor();
    await shot(p, "dashboard-usage-dark", false);
  }
  await p.context().close();
}

// pt-BR dashboard, to check the catalogs load.
{
  const p = await page("dark", 1280, 800, "pt-BR");
  await p.goto(`${WEB}/machines`, { waitUntil: "networkidle" });
  await p.getByRole("link", { name: "build-runner" }).waitFor();
  await shot(p, "dashboard-machines-pt-BR-dark", false);
  await p.context().close();
}

await browser.close();
console.log(saved.join("\n"));
