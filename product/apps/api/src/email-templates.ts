import type { WaitlistLocale } from "@rookbox/contracts";
import type { EmailMessage } from "./email.js";

const ACCENT = "#0b7a5a";
const INK = "#0a0a0a";
const BODY = "#3d3d3d";
const MUTED = "#6b6b6b";
const LINE = "#e6e6e6";
const FONT = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Where the logo is served when no landing origin is configured. */
export const DEFAULT_SITE_URL = "https://rookbox.run";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type Words = {
  lang: string;
  joined: { subject: string; preheader: string; title: string; body: string };
  invited: {
    subject: string;
    preheader: string;
    title: string;
    body: string;
    button: string;
    emailLabel: string;
    passwordLabel: string;
    change: string;
  };
  signoff: string;
  footer: string;
};

const WORDS: Record<WaitlistLocale, Words> = {
  en: {
    lang: "en",
    joined: {
      subject: "You're on the Rookbox waitlist",
      preheader: "We'll email your invitation when a spot opens.",
      title: "You're on the list.",
      body: "Thanks for asking for access to Rookbox. We send invitations by email in small batches, and yours will arrive when a spot opens.",
    },
    invited: {
      subject: "Your Rookbox invitation",
      preheader: "Your account is ready.",
      title: "Your account is ready.",
      body: "You're in. Sign in and start your first machine.",
      button: "Sign in to Rookbox",
      emailLabel: "Email",
      passwordLabel: "Temporary password",
      change: "Change it after signing in.",
    },
    signoff: "Pedro, Rook",
    footer: "You got this email because this address asked for access to Rookbox.",
  },
  pt: {
    lang: "pt-BR",
    joined: {
      subject: "Você está na lista de espera do Rookbox",
      preheader: "Enviamos o convite por email quando abrir uma vaga.",
      title: "Você está na lista.",
      body: "Obrigado por pedir acesso ao Rookbox. Enviamos os convites por email, em lotes pequenos, e o seu chega quando abrir uma vaga.",
    },
    invited: {
      subject: "Seu convite para o Rookbox",
      preheader: "Sua conta está pronta.",
      title: "Sua conta está pronta.",
      body: "Você entrou. Acesse e crie sua primeira máquina.",
      button: "Entrar no Rookbox",
      emailLabel: "Email",
      passwordLabel: "Senha temporária",
      change: "Troque-a depois de entrar.",
    },
    signoff: "Pedro, Rook",
    footer: "Você recebeu este email porque este endereço pediu acesso ao Rookbox.",
  },
  es: {
    lang: "es",
    joined: {
      subject: "Estás en la lista de espera de Rookbox",
      preheader: "Te enviamos la invitación por email cuando se libere un lugar.",
      title: "Estás en la lista.",
      body: "Gracias por pedir acceso a Rookbox. Enviamos las invitaciones por email, en grupos pequeños, y la tuya llegará cuando se libere un lugar.",
    },
    invited: {
      subject: "Tu invitación a Rookbox",
      preheader: "Tu cuenta está lista.",
      title: "Tu cuenta está lista.",
      body: "Ya estás dentro. Entra y crea tu primera máquina.",
      button: "Entrar a Rookbox",
      emailLabel: "Email",
      passwordLabel: "Contraseña temporal",
      change: "Cámbiala después de entrar.",
    },
    signoff: "Pedro, Rook",
    footer: "Recibes este email porque esta dirección pidió acceso a Rookbox.",
  },
};

type Block = { html: string; text: string };

const paragraph = (value: string, color = BODY, size = 16): Block => ({
  html: `<p class="fg" style="margin:0 0 20px;font:400 ${size}px/1.6 ${FONT};color:${color};">${escapeHtml(value)}</p>`,
  text: value,
});

function button(label: string, url: string): Block {
  const href = escapeHtml(url);
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 28px;"><tr><td style="border-radius:8px;background:${ACCENT};" bgcolor="${ACCENT}"><a href="${href}" style="display:inline-block;padding:13px 24px;border-radius:8px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`,
    text: `${label}: ${url}`,
  };
}

function credentials(rows: [string, string][], note: string): Block {
  const body = rows
    .map(
      ([label, value], index) =>
        `<tr><td style="padding:${index === 0 ? "14px" : "10px"} 16px ${index === rows.length - 1 ? "14px" : "0"};"><div style="font:500 12px/1.4 ${FONT};color:${MUTED};" class="mut">${escapeHtml(label)}</div><div class="fg" style="margin-top:2px;font:500 14px/1.5 ${MONO};color:${INK};word-break:break-all;">${escapeHtml(value)}</div></td></tr>`,
    )
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="margin:0 0 12px;border:1px solid ${LINE};border-radius:8px;background:#f7f7f7;" bgcolor="#f7f7f7">${body}</table><p class="mut" style="margin:0 0 24px;font:400 13px/1.5 ${FONT};color:${MUTED};">${escapeHtml(note)}</p>`,
    text: `${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n${note}`,
  };
}

function layout(input: {
  lang: string;
  siteUrl: string;
  title: string;
  preheader: string;
  blocks: Block[];
  footer: string;
}): { html: string; text: string } {
  const { lang, title, preheader, blocks, footer } = input;
  const logo = `${input.siteUrl.replace(/\/+$/, "")}/email/logo.png`;
  const html = `<!doctype html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .page { background:#0b0b0b !important; }
  .card { background:#151515 !important; border-color:#2a2a2a !important; }
  .hd, .fg { color:#f2f2f2 !important; }
  .mut { color:#a0a0a0 !important; }
  .box { background:#1d1d1d !important; border-color:#2f2f2f !important; }
}
@media only screen and (max-width: 520px) {
  .pad { padding:28px 22px !important; }
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:#f4f4f4;" bgcolor="#f4f4f4">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:#f4f4f4;" bgcolor="#f4f4f4">
<tr><td align="center" style="padding:40px 12px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" class="card" style="width:100%;max-width:480px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;" bgcolor="#ffffff">
<tr><td class="pad" style="padding:36px 36px 32px;">
<img src="${escapeHtml(logo)}" width="128" height="32" alt="Rookbox" style="display:block;margin:0 0 36px;border:0;outline:none;height:32px;width:128px;">
<h1 class="hd" style="margin:0 0 14px;font:600 26px/1.2 ${FONT};letter-spacing:-0.02em;color:${INK};">${escapeHtml(title)}</h1>
${blocks.map((block) => block.html).join("\n")}
</td></tr>
</table>
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;">
<tr><td class="mut" style="padding:16px 8px 0;font:400 12px/1.5 ${FONT};color:${MUTED};text-align:center;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [title, ...blocks.map((block) => block.text), `-- ${footer}`].join("\n\n");
  return { html, text };
}

/** Sent when someone joins the waitlist. */
export function waitlistJoinedEmail(input: {
  to: string;
  locale: WaitlistLocale;
  /** The landing's origin, where the logo is served. */
  siteUrl?: string;
}): EmailMessage {
  const words = WORDS[input.locale];
  const copy = words.joined;
  const { html, text } = layout({
    lang: words.lang,
    siteUrl: input.siteUrl ?? DEFAULT_SITE_URL,
    title: copy.title,
    preheader: copy.preheader,
    footer: words.footer,
    blocks: [paragraph(copy.body), paragraph(words.signoff, MUTED, 15)],
  });
  return { to: input.to, subject: copy.subject, html, text };
}

/** Sent when an operator invites someone: the sign-in link and the temporary password. */
export function waitlistInvitedEmail(input: {
  to: string;
  locale: WaitlistLocale;
  signInUrl: string;
  password: string;
  siteUrl?: string;
}): EmailMessage {
  const words = WORDS[input.locale];
  const copy = words.invited;
  const { html, text } = layout({
    lang: words.lang,
    siteUrl: input.siteUrl ?? DEFAULT_SITE_URL,
    title: copy.title,
    preheader: copy.preheader,
    footer: words.footer,
    blocks: [
      paragraph(copy.body),
      button(copy.button, input.signInUrl),
      credentials(
        [
          [copy.emailLabel, input.to],
          [copy.passwordLabel, input.password],
        ],
        copy.change,
      ),
    ],
  });
  return { to: input.to, subject: copy.subject, html, text };
}
