import type { WaitlistLocale } from "@rookbox/contracts";
import type { EmailMessage } from "./email.js";

const ACCENT = "#0b7a5a";
const INK = "#0a0a0a";
const BODY = "#3d3d3d";
const MUTED = "#6b6b6b";
const LINE = "#e4e4e4";
const FONT = "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type Words = {
  lang: string;
  joined: {
    subject: string;
    preheader: string;
    title: string;
    intro: string;
    next: string;
    bye: string;
  };
  invited: {
    subject: string;
    preheader: string;
    title: string;
    intro: string;
    button: string;
    emailLabel: string;
    passwordLabel: string;
    change: string;
    bye: string;
  };
  footer: string;
};

const WORDS: Record<WaitlistLocale, Words> = {
  en: {
    lang: "en",
    joined: {
      subject: "You are on the Rookbox waitlist",
      preheader: "We will email you when your invitation is ready.",
      title: "You are on the list.",
      intro:
        "Thanks for asking for access to Rookbox, on-demand Linux machines for AI agents. We let people in by invitation, in small batches, so the machines stay fast.",
      next: "What happens next: when a spot opens we send you an invitation email with your sign-in link. There is nothing else to do, and you do not need to reply to this message.",
      bye: "The Rookbox team",
    },
    invited: {
      subject: "Your Rookbox invitation",
      preheader: "Your account is ready. Sign in and start your first machine.",
      title: "Your account is ready.",
      intro:
        "You are in. We created your Rookbox account, so you can sign in and start your first machine right away.",
      button: "Sign in to Rookbox",
      emailLabel: "Email",
      passwordLabel: "Temporary password",
      change: "Please change the password after your first sign-in. Do not forward this email.",
      bye: "The Rookbox team",
    },
    footer: "You get this email because this address asked for access to Rookbox.",
  },
  pt: {
    lang: "pt-BR",
    joined: {
      subject: "Você está na lista de espera do Rookbox",
      preheader: "Avisamos por email quando o seu convite estiver pronto.",
      title: "Você está na lista.",
      intro:
        "Obrigado por pedir acesso ao Rookbox, máquinas Linux sob demanda para agentes de IA. Liberamos o acesso por convite, em lotes pequenos, para que as máquinas continuem rápidas.",
      next: "O que acontece agora: quando abrir uma vaga, enviamos um email de convite com o seu link de acesso. Não há mais nada a fazer, e você não precisa responder a esta mensagem.",
      bye: "Equipe Rookbox",
    },
    invited: {
      subject: "Seu convite para o Rookbox",
      preheader: "Sua conta está pronta. Entre e crie sua primeira máquina.",
      title: "Sua conta está pronta.",
      intro:
        "Você entrou. Criamos a sua conta no Rookbox, então já dá para entrar e criar a sua primeira máquina.",
      button: "Entrar no Rookbox",
      emailLabel: "Email",
      passwordLabel: "Senha temporária",
      change: "Troque a senha depois do primeiro acesso. Não encaminhe este email.",
      bye: "Equipe Rookbox",
    },
    footer: "Você recebeu este email porque este endereço pediu acesso ao Rookbox.",
  },
  es: {
    lang: "es",
    joined: {
      subject: "Estás en la lista de espera de Rookbox",
      preheader: "Te escribimos cuando tu invitación esté lista.",
      title: "Estás en la lista.",
      intro:
        "Gracias por pedir acceso a Rookbox, máquinas Linux bajo demanda para agentes de IA. Damos acceso por invitación, en grupos pequeños, para que las máquinas sigan siendo rápidas.",
      next: "Qué pasa ahora: cuando se libere un lugar te enviamos un email de invitación con tu enlace de acceso. No tienes que hacer nada más ni responder a este mensaje.",
      bye: "El equipo de Rookbox",
    },
    invited: {
      subject: "Tu invitación a Rookbox",
      preheader: "Tu cuenta está lista. Entra y crea tu primera máquina.",
      title: "Tu cuenta está lista.",
      intro:
        "Ya estás dentro. Creamos tu cuenta de Rookbox, así que puedes entrar y crear tu primera máquina ahora mismo.",
      button: "Entrar a Rookbox",
      emailLabel: "Email",
      passwordLabel: "Contraseña temporal",
      change: "Cambia la contraseña después del primer acceso. No reenvíes este email.",
      bye: "El equipo de Rookbox",
    },
    footer: "Recibes este email porque esta dirección pidió acceso a Rookbox.",
  },
};

type Block = { html: string; text: string };

const paragraph = (value: string, color = BODY): Block => ({
  html: `<p class="fg" style="margin:0 0 18px;font:400 16px/1.6 ${FONT};color:${color};">${escapeHtml(value)}</p>`,
  text: value,
});

function button(label: string, url: string): Block {
  const href = escapeHtml(url);
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;"><tr><td style="border-radius:999px;background:${ACCENT};" bgcolor="${ACCENT}"><a href="${href}" style="display:inline-block;padding:14px 26px;border-radius:999px;font:600 16px/1 ${FONT};color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`,
    text: `${label}: ${url}`,
  };
}

function credentials(rows: [string, string][]): Block {
  const body = rows
    .map(
      ([label, value], index) =>
        `<tr><td style="padding:${index === 0 ? "16px" : "4px"} 18px ${index === rows.length - 1 ? "16px" : "0"};"><div style="font:600 12px/1.4 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</div><div class="fg" style="margin-top:4px;font:500 15px/1.5 ${MONO};color:${INK};word-break:break-all;">${escapeHtml(value)}</div></td></tr>`,
    )
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="box" style="margin:0 0 24px;border:1px solid ${LINE};border-radius:12px;background:#f6f6f6;" bgcolor="#f6f6f6">${body}</table>`,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
  };
}

function layout(input: {
  lang: string;
  title: string;
  preheader: string;
  blocks: Block[];
  footer: string;
}): { html: string; text: string } {
  const { lang, title, preheader, blocks, footer } = input;
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
  .pad { padding:28px 20px !important; }
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:#f2f2f2;" bgcolor="#f2f2f2">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="background:#f2f2f2;" bgcolor="#f2f2f2">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="card" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:20px;" bgcolor="#ffffff">
<tr><td class="pad" style="padding:40px 40px 36px;">
<div class="hd" style="margin:0 0 32px;font:700 20px/1 ${FONT};letter-spacing:-0.02em;color:${INK};"><span style="color:${ACCENT};">&#9632;</span>&nbsp; Rookbox</div>
<h1 class="hd" style="margin:0 0 16px;font:600 30px/1.1 ${FONT};letter-spacing:-0.03em;color:${INK};">${escapeHtml(title)}</h1>
${blocks.map((block) => block.html).join("\n")}
</td></tr>
</table>
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td class="mut" style="padding:18px 8px 0;font:400 12px/1.5 ${FONT};color:${MUTED};text-align:center;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [title, "", ...blocks.map((block) => block.text), "", "--", footer].join("\n\n");
  return { html, text };
}

/** Sent when someone joins the waitlist. */
export function waitlistJoinedEmail(to: string, locale: WaitlistLocale): EmailMessage {
  const words = WORDS[locale];
  const copy = words.joined;
  const { html, text } = layout({
    lang: words.lang,
    title: copy.title,
    preheader: copy.preheader,
    footer: words.footer,
    blocks: [paragraph(copy.intro), paragraph(copy.next), paragraph(copy.bye, MUTED)],
  });
  return { to, subject: copy.subject, html, text };
}

/** Sent when an operator invites someone: the sign-in link and the temporary password. */
export function waitlistInvitedEmail(input: {
  to: string;
  locale: WaitlistLocale;
  signInUrl: string;
  password: string;
}): EmailMessage {
  const words = WORDS[input.locale];
  const copy = words.invited;
  const { html, text } = layout({
    lang: words.lang,
    title: copy.title,
    preheader: copy.preheader,
    footer: words.footer,
    blocks: [
      paragraph(copy.intro),
      button(copy.button, input.signInUrl),
      credentials([
        [copy.emailLabel, input.to],
        [copy.passwordLabel, input.password],
      ]),
      paragraph(copy.change),
      paragraph(copy.bye, MUTED),
    ],
  });
  return { to: input.to, subject: copy.subject, html, text };
}
