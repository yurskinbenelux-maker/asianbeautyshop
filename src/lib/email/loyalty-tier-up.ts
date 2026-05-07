// ─────────────────────────────────────────────────────────────────────────
// "Tier up" — fires the moment a customer crosses a tier threshold via
// a points accrual. Localised EN / NL / FR / RU. Shorter than the club
// welcome — it's a celebratory nudge, not a guide.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";

type Strings = {
  subject: (tier: string) => string;
  preheader: string;
  heading: (tier: string) => string;
  body: (tier: string, prevTier: string | null) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (t) => `You're now ${t}`,
    preheader: "A new tier in your Asian Beauty Shop Club account.",
    heading: (t) => `${t}.`,
    body: (t, prev) =>
      prev
        ? `Just a quick note: your Asian Beauty Shop Club tier just moved from ${prev} to ${t}. Keep going at your own pace.`
        : `Welcome to ${t} — your first Asian Beauty Shop Club tier. Keep going at your own pace.`,
    cta: "Open my account",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (t) => `Je bent nu ${t}`,
    preheader: "Een nieuw niveau in je Asian Beauty Shop Club account.",
    heading: (t) => `${t}.`,
    body: (t, prev) =>
      prev
        ? `Een korte notitie: je Asian Beauty Shop Club-niveau is zojuist veranderd van ${prev} naar ${t}. Ga in je eigen tempo verder.`
        : `Welkom bij ${t} — je eerste Asian Beauty Shop Club-niveau. Ga in je eigen tempo verder.`,
    cta: "Open mijn account",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (t) => `Vous êtes désormais ${t}`,
    preheader: "Un nouveau palier dans votre Asian Beauty Shop Club.",
    heading: (t) => `${t}.`,
    body: (t, prev) =>
      prev
        ? `Un mot rapide : votre palier Asian Beauty Shop Club vient de passer de ${prev} à ${t}. Continuez à votre rythme.`
        : `Bienvenue au palier ${t} — votre premier dans le Asian Beauty Shop Club. Continuez à votre rythme.`,
    cta: "Ouvrir mon compte",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (t) => `Вы теперь ${t}`,
    preheader: "Новый уровень в Asian Beauty Shop Club.",
    heading: (t) => `${t}.`,
    body: (t, prev) =>
      prev
        ? `Короткая заметка: ваш уровень Asian Beauty Shop Club только что поднялся с ${prev} до ${t}. Продолжайте в своём темпе.`
        : `Добро пожаловать на уровень ${t} — ваш первый в Asian Beauty Shop Club. Продолжайте в своём темпе.`,
    cta: "Открыть аккаунт",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type LoyaltyTierUpPayload = {
  email: string;
  firstName: string | null;
  locale: Locale;
  newTier: string;
  previousTier: string | null;
};

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendLoyaltyTierUpEmail(
  payload: LoyaltyTierUpPayload,
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const accountUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/account`;

  const html = renderEmailShell({
    title: s.subject(payload.newTier),
    preheader: s.preheader,
    lang: payload.locale.toLowerCase(),
    body: `
      <p style="margin:24px 0 8px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C8362C;">
        ${esc(payload.firstName ? `${payload.firstName},` : "A new tier")}
      </p>
      <h1 style="margin:0 0 16px 0;font-family:Georgia,serif;font-style:italic;font-size:44px;line-height:1.05;color:#121110;font-weight:400;">
        ${esc(s.heading(payload.newTier))}
      </h1>
      <p style="margin:0 0 28px 0;font-size:15px;line-height:1.7;color:#3D3935;">
        ${esc(s.body(payload.newTier, payload.previousTier))}
      </p>
      ${renderCtaButton(accountUrl, s.cta)}
      <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
        ${esc(s.signoff)}
      </p>
    `,
    footerNote: s.footer,
  });

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: s.subject(payload.newTier),
      html,
      tags: [{ name: "type", value: "loyalty-tier-up" }],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/loyalty-tier-up] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}
