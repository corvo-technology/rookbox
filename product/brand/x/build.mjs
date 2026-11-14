/**
 * Renders the X brand kit (avatar, banner, launch post images, carousel) into ./png with headless
 * Chrome, the same way apps/www/scripts/og.ts renders the share images.
 *
 *   node product/brand/x/build.mjs            # everything
 *   node product/brand/x/build.mjs banner     # only files whose name contains "banner"
 *
 * Needs Chrome (set CHROME_PATH, or the usual macOS/Linux paths are tried). If ffmpeg is on the
 * PATH the PNGs are palette-quantized, which is lossless in practice for flat colors.
 * No dependencies beyond Node. Layout lives in the functions below, tokens in base.css.
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

const HERE = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(HERE, "png");
const FONT = pathToFileURL(
  join(HERE, "../../apps/www/public/fonts/instrument-sans-latin.woff2"),
).href;
const DOMAIN = "rookbox.run";
const API_DOMAIN = "box.rookbox.run";
const HANDLE = "@rookboxx";

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("Chrome not found. Set CHROME_PATH.");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The "Gate" mark, same paths as apps/web/src/components/Logo.tsx (64 grid, cropped to 16 12 32 40). */
const MARK_PATH =
  "M16 12h8v7h4v-7h8v7h4v-7h8v10.5H16zM16 25.3h32V52H16zM27 52V40a5 5 0 0 1 10 0v12z";
const mark = () =>
  `<svg viewBox="16 12 32 40" aria-hidden="true"><path fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;
const logo = (size) =>
  `<div class="logo" style="font-size:${size}px">${mark()}<span>Rookbox</span></div>`;

/** Terminal lines: [text, tone] with tone "" | "m" (comment) | "o" (output) | "hl" (changed line). */
const term = (lines, { size, bar = "", pad = 28 }) => {
  const rows = lines.map(([t, tone]) => `<div class="l ${tone}">${esc(t) || " "}</div>`).join("");
  const barH = Math.round(size * 2.6);
  return `<div class="term" style="font-size:${size}px;line-height:1.7">
    <div class="bar" style="height:${barH}px;padding:0 ${pad}px;font-size:${Math.round(size * 0.85)}px"><i></i><i></i><i></i>${bar ? `<span>${esc(bar)}</span>` : ""}</div>
    <div style="padding:${Math.round(size * 0.6)}px ${pad}px ${Math.round(size * 0.75)}px">${rows}</div>
  </div>`;
};

// Copy. Code is real E2B SDK usage (see apps/www/src/snippets.ts); only comments are localized.
const COPY = {
  pt: {
    lang: "pt-BR",
    title: "Dê a cada agente o próprio computador.",
    ready: "# pronta em cerca de 2 s",
    label: "Sessão de exemplo",
    waitTitle: "Lista de espera aberta.",
    waitSub: "Máquinas Linux sob demanda para agentes. Acesso por convite, em lotes pequenos.",
  },
  en: {
    lang: "en",
    title: "Give every agent its own computer.",
    ready: "# ready in about 2 s",
    label: "Sample session",
    waitTitle: "Waitlist is open.",
    waitSub: "On-demand Linux machines for agents. Invitation only, in small batches.",
  },
};
const createLines = (c) => [
  ["from e2b import Sandbox", ""],
  ["", ""],
  ["sbx = Sandbox.create(", ""],
  [`    domain="${API_DOMAIN}",`, "hl"],
  ['    template="seed")', ""],
  [c.ready, "m"],
];

// Layouts. Each returns { name, w, h, css, body, dark?, lang? }.
function avatar(dark) {
  return {
    name: dark ? "avatar-dark" : "avatar",
    w: 400,
    h: 400,
    dark,
    // X crops to a circle (radius 200). The mark is 200x250: its corners sit 160px from the center.
    css: `.mk{position:absolute;left:100px;top:75px;width:200px;height:250px}
          .mk svg{width:100%;height:100%;display:block;fill:var(--ink)}`,
    body: `<div class="mk">${mark()}</div>`,
  };
}

function banner(loc) {
  const c = COPY[loc];
  return {
    name: `banner-${loc}`,
    w: 1500,
    h: 500,
    dark: true,
    lang: c.lang,
    // The left 440px stay empty (avatar on desktop). 70px top and bottom stay clear for mobile crops.
    css: `h1{position:absolute;left:440px;top:112px;width:470px;font-size:56px}
      .meta{position:absolute;left:440px;top:340px;font-size:26px;font-weight:500;color:var(--mut);display:flex;gap:18px;align-items:center}
      .meta b{color:var(--ink);font-weight:600}
      .meta i{width:5px;height:5px;border-radius:50%;background:var(--green);display:block}
      .term{position:absolute;left:960px;top:128px;width:480px}`,
    body: `<h1>${esc(c.title)}</h1>
      <div class="meta"><b>${HANDLE}</b><i></i><span>${DOMAIN}</span></div>
      ${term(createLines(c), { size: 17, bar: c.label, pad: 24 })}`,
  };
}

function launch(loc) {
  const c = COPY[loc];
  return {
    name: `launch-${loc}`,
    w: 1200,
    h: 675,
    lang: c.lang,
    css: `.logo{position:absolute;left:72px;top:64px}
      .head{position:absolute;left:72px;top:156px;width:520px}
      h1{font-size:80px}
      p{margin-top:32px;width:470px;font-size:27px;line-height:1.35;color:var(--mut);text-wrap:pretty}
      .foot{position:absolute;left:72px;bottom:56px;font-size:28px;font-weight:600;display:flex;gap:16px;align-items:center}
      .foot i{width:12px;height:12px;border-radius:50%;background:var(--green);display:block}
      .foot span{color:var(--mut);font-weight:500}
      .term{position:absolute;left:624px;top:196px;width:504px}`,
    body: `${logo(34)}<div class="head"><h1>${esc(c.waitTitle)}</h1><p>${esc(c.waitSub)}</p></div>
      <div class="foot"><i></i>${DOMAIN}<span>${HANDLE}</span></div>
      ${term(createLines(c), { size: 19, bar: c.label })}`,
  };
}

function launchPix() {
  const ticks = Array.from({ length: 48 }, (_, i) => `<b class="${i < 30 ? "on" : ""}"></b>`).join(
    "",
  );
  return {
    name: "launch-pt-pix",
    w: 1200,
    h: 675,
    dark: true,
    lang: "pt-BR",
    css: `.logo{position:absolute;left:72px;top:64px}
      .tag{position:absolute;right:72px;top:62px;font-size:22px;font-weight:600;color:var(--green);border:2px dashed var(--green);border-radius:8px;padding:9px 16px}
      h1{position:absolute;left:72px;top:150px;width:900px;font-size:96px}
      h1 em{font-style:normal;color:var(--green)}
      p{position:absolute;left:72px;top:376px;width:700px;font-size:29px;line-height:1.35;color:var(--mut);text-wrap:pretty}
      .meter{position:absolute;left:72px;top:470px;width:1056px}
      .ticks{display:flex;justify-content:space-between;align-items:flex-end;height:44px}
      .ticks b{width:6px;height:100%;background:var(--line);display:block;border-radius:1px}
      .ticks b.on{background:var(--green)}
      .legend{display:flex;justify-content:space-between;margin-top:14px;font-size:20px;color:var(--mut)}
      .foot{position:absolute;left:72px;bottom:44px;font-size:24px;font-weight:600;display:flex;gap:16px;align-items:center}
      .foot span{color:var(--mut);font-weight:500}`,
    body: `${logo(34)}<div class="tag">Previsto. Ainda não está no ar.</div>
      <h1>Pague em reais, com <em>Pix</em>.</h1>
      <p>Previsto para a cobrança, que será por segundo. Os preços ainda não foram publicados.</p>
      <div class="meter"><div class="ticks">${ticks}</div><div class="legend"><span>a máquina inicia</span><span>a máquina suspende</span></div></div>
      <div class="foot">${DOMAIN}<span>${HANDLE}</span></div>`,
  };
}

// Carousel, 1080x1350, pt only.
const SLIDE_CSS = `
  .top{position:absolute;left:84px;right:84px;top:76px;display:flex;justify-content:space-between;align-items:center}
  .top .n{font-size:26px;font-weight:600;color:var(--mut);font-variant-numeric:tabular-nums}
  .head{position:absolute;left:84px;top:190px;width:880px}
  h1{font-size:112px;line-height:1.02}
  .lead{margin-top:40px;width:820px;font-size:38px;line-height:1.35;color:var(--mut);text-wrap:pretty}
  .foot{position:absolute;left:84px;right:84px;bottom:72px;display:flex;justify-content:space-between;font-size:26px;font-weight:600}
  .foot span{color:var(--mut);font-weight:500}
  .term{position:absolute;left:84px;right:84px}
`;
const slide = (n, { dark, css = "", body }) => ({
  name: `carousel-${n}`,
  w: 1080,
  h: 1350,
  dark,
  lang: "pt-BR",
  css: SLIDE_CSS + css,
  body: `<div class="top">${logo(30)}<div class="n">${n}/4</div></div>${body}
    <div class="foot">${DOMAIN}<span>${HANDLE}</span></div>`,
});

const carousel = () => [
  slide(1, {
    css: `h1{font-size:104px}
      .facts{position:absolute;left:84px;right:84px;top:900px;border-top:2px solid var(--ink)}
      .facts div{padding:26px 0;border-bottom:1px solid var(--line);font-size:38px;font-weight:600}`,
    body: `<div class="head"><h1>Um computador para cada agente.</h1>
      <p class="lead">Máquinas Linux sob demanda. Cada uma é uma microVM Firecracker, não um contêiner compartilhado.</p></div>
      <div class="facts"><div>Kernel próprio</div><div>Inicia em cerca de 2 s</div><div>Retoma em cerca de 1 s</div></div>`,
  }),
  slide(2, {
    css: `h1{font-size:100px}.lead{margin-top:32px}.term{top:610px}`,
    body: `<div class="head"><h1>Crie, rode, suspenda, retome.</h1>
      <p class="lead">Quatro chamadas cobrem boa parte do dia de um agente.</p></div>
      ${term(
        [
          ['sbx = Sandbox.create(template="seed")', ""],
          ["# pronta em cerca de 2 s", "m"],
          ["", ""],
          ['sbx.commands.run("uname -sr").stdout', ""],
          ["Linux", "o"],
          ["", ""],
          ["sbx.pause()  # suspende, mantém a memória", ""],
          ["", ""],
          ["Sandbox.connect(sbx.sandbox_id)", ""],
          ["# retoma em cerca de 1 s", "m"],
        ],
        { size: 27, bar: "Sessão de exemplo", pad: 36 },
      )}`,
  }),
  slide(3, {
    css: `h1{font-size:116px}
      .stack{position:absolute;left:84px;right:84px;top:570px;display:flex;flex-direction:column;gap:24px}
      .stack .term{position:static}`,
    body: `<div class="head"><h1>Mude uma linha.</h1>
      <p class="lead">Se você já usa o SDK da E2B, aponte o domínio para o Rookbox. O resto do código continua igual.</p></div>
      <div class="stack">${term(
        [
          ["sbx = Sandbox.create(", ""],
          ["    api_key=API_KEY,", ""],
          [")", ""],
        ],
        { size: 26, bar: "Antes", pad: 36 },
      )}${term(
        [
          ["sbx = Sandbox.create(", ""],
          [`    domain="${API_DOMAIN}",`, "hl"],
          ["    api_key=API_KEY,", ""],
          [")", ""],
        ],
        { size: 26, bar: "Com o Rookbox", pad: 36 },
      )}</div>`,
  }),
  slide(4, {
    dark: true,
    css: `h1{font-size:128px}
      .url{position:absolute;left:84px;top:830px;font-size:104px;font-weight:700;letter-spacing:-0.04em;color:var(--green)}
      .note{position:absolute;left:84px;top:980px;width:820px;font-size:30px;line-height:1.4;color:var(--mut);text-wrap:pretty}`,
    body: `<div class="head"><h1>Entre na lista de espera.</h1>
      <p class="lead">O acesso é só por convite, em lotes pequenos, para as máquinas continuarem rápidas.</p></div>
      <div class="url">${DOMAIN}</div>
      <p class="note">Deixe seu email no site. Escrevemos quando o seu convite estiver pronto.</p>`,
  }),
];

const jobs = [
  avatar(false),
  avatar(true),
  banner("pt"),
  banner("en"),
  launch("pt"),
  launch("en"),
  launchPix(),
  ...carousel(),
];

// Render.
const baseCss = readFileSync(join(HERE, "base.css"), "utf8");
const work = mkdtempSync(join(tmpdir(), "rookbox-x-"));
mkdirSync(OUT, { recursive: true });
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const filter = process.argv[2];
for (const job of jobs) {
  if (filter && !job.name.includes(filter)) continue;
  const css = `:root{--w:${job.w}px;--h:${job.h}px}${baseCss.replace("{{fontUrl}}", FONT)}`;
  const html = `<!doctype html><html lang="${job.lang ?? "en"}"><head><meta charset="utf-8"><style>${css}${job.css}</style></head><body class="${job.dark ? "dark" : ""}">${job.body}</body></html>`;
  const page = join(work, `${job.name}.html`);
  const raw = join(work, `${job.name}.png`);
  const out = join(OUT, `${job.name}.png`);
  writeFileSync(page, html);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${job.w},${job.h}`,
      "--virtual-time-budget=3000",
      `--screenshot=${raw}`,
      pathToFileURL(page).href,
    ],
    { stdio: "ignore" },
  );
  if (hasFfmpeg) {
    const small = join(work, `${job.name}.small.png`);
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
  console.log(`wrote png/${job.name}.png`);
}
