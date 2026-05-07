// ─────────────────────────────────────────────────────────────────────────
// Email — "your referral worked".
//
// Fires from awardReferrerOnFirstOrder once the referee's first paid
// order lands. Localised EN / NL / FR / RU.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";

type Strings = {
  subject: string;
  preheader: string;
  heading: (firstName: string | null) => string;
  body: (points: number, friendEmail: string) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Your referral worked",
    preheader: "Bonus points just landed.",
    heading: (f) =>
      f ? `Thank you, ${f}.` : "Thank you.",
    body: (p, e) =>
      `${e} just placed their first Asian Beauty Shop order — your gesture put them on a calmer skin path. We've added ${p} bonus points to your Asian Beauty Shop Club balance as a small thanks. Spend them whenever feels right.`,
    cta: "Open my account",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Je doorverwijzing werkte",
    preheader: "Bonuspunten zijn binnen.",
    heading: (f) => (f ? `Dank je, ${f}.` : "Dank je."),
    body: (p, e) =>
      `${e} heeft net hun eerste Asian Beauty Shop bestelling geplaatst — jouw gebaar bracht ze op een rustiger huidpad. We hebben ${p} bonuspunten toegevoegd aan je Asian Beauty Shop Club saldo als kleine dank. Wissel ze in wanneer het goed voelt.`,
    cta: "Open mijn account",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Votre parrainage a marché",
    preheader: "Des points bonus sont arrivés.",
    heading: (f) => (f ? `Merci, ${f}.` : "Merci."),
    body: (p, e) =>
      `${e} vient de passer sa première commande Asian Beauty Shop — votre geste l'a mise sur un chemin de peau plus calme. Nous avons ajouté ${p} points bonus à votre solde Asian Beauty Shop Club en remerciement. Utilisez-les quand bon vous semble.`,
    cta: "Ouvrir mon compte",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Ваше приглашение сработало",
    preheader: "Бонусные баллы зачислены.",
    heading: (f) => (f ? `Спасибо, ${f}.` : "Спасибо."),
    body: (p, e) =>
      `${e} только что оформил(а) свой первый заказ Asian Beauty Shop — ваш жест направил его(её) к более спокойной коже. Мы добавили ${p} бонусных баллов на ваш счёт Asian Beauty Shop Club в знак благодарности. Используйте, когда будет уместно.`,
    cta: "Открыть аккаунт",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type ReferralRewardedPayload = {
  email: string;
  firstName: string | null;
  locale: Locale;
  pointsAwarded: number;
  refereeEmail: string;
};

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendReferralRewardedEmail(
  payload: ReferralRewardedPayload,
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const accountUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/account`;

  const html = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: payload.locale.toLowerCase(),
    body: `
      <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#121110;font-weight:400;">
        ${esc(s.heading(payload.firstName))}
      </h1>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
        ${esc(s.body(payload.pointsAwarded, payload.refereeEmail))}
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
      subject: s.subject,
      html,
      tags: [{ name: "type", value: "referral-rewarded" }],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/referral-rewarded] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}
