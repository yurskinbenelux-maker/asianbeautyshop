// ─────────────────────────────────────────────────────────────────────────
// "Welcome to A-Beauty Club" — fires once, on the first LoyaltyAccount
// creation. Distinct from the registration welcome (10% coupon email):
// this one introduces the points programme itself + their referral code.
//
// Localised EN / NL / FR / RU.
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
  intro: string;
  bullets: string[];
  referralLabel: string;
  referralBody: (code: string) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Welcome to the A-Beauty Club",
    preheader: "A small thank-you for being here.",
    heading: (f) => (f ? `Welcome, ${f}.` : "Welcome."),
    intro:
      "You're now part of the A-Beauty Club — our quiet way of saying thank you, in points you can spend on the products that suit your skin.",
    bullets: [
      "5 points for every €1 you spend on an order",
      "150 points on your birthday, every year",
      "250 bonus points the moment a friend you referred makes their first order",
    ],
    referralLabel: "Your referral code",
    referralBody: (c) =>
      `Share this code with a friend. They'll get a 5% welcome on top of theirs, you'll get the bonus when they order. Your code: ${c}`,
    cta: "Open the A-Beauty Club",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Welkom bij de A-Beauty Club",
    preheader: "Een klein bedankje dat je hier bent.",
    heading: (f) => (f ? `Welkom, ${f}.` : "Welkom."),
    intro:
      "Je maakt nu deel uit van de A-Beauty Club — onze stille manier van bedanken, in punten die je kunt uitgeven aan producten die bij je huid passen.",
    bullets: [
      "5 punten voor elke €1 die je aan een bestelling besteedt",
      "150 punten op je verjaardag, elk jaar",
      "250 bonuspunten zodra een door jou doorverwezen vriend zijn eerste bestelling plaatst",
    ],
    referralLabel: "Jouw doorverwijzingscode",
    referralBody: (c) =>
      `Deel deze code met een vriend. Zij krijgen 5% bovenop hun welkom, jij krijgt de bonus zodra ze bestellen. Jouw code: ${c}`,
    cta: "Open de A-Beauty Club",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Bienvenue dans le A-Beauty Club",
    preheader: "Un petit merci d'être ici.",
    heading: (f) => (f ? `Bienvenue, ${f}.` : "Bienvenue."),
    intro:
      "Vous faites désormais partie du A-Beauty Club — notre manière discrète de dire merci, en points à dépenser sur les produits qui correspondent à votre peau.",
    bullets: [
      "5 points pour chaque 1 € dépensé sur une commande",
      "150 points pour votre anniversaire, chaque année",
      "250 points bonus dès qu'un·e ami·e parrainé·e passe sa première commande",
    ],
    referralLabel: "Votre code de parrainage",
    referralBody: (c) =>
      `Partagez ce code avec un·e ami·e. Iel reçoit 5% en plus de son bonus de bienvenue, vous gagnez les points à sa première commande. Votre code : ${c}`,
    cta: "Ouvrir le A-Beauty Club",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Добро пожаловать в A-Beauty Club",
    preheader: "Маленькое спасибо за то, что вы с нами.",
    heading: (f) => (f ? `Добро пожаловать, ${f}.` : "Добро пожаловать."),
    intro:
      "Теперь вы — часть A-Beauty Club. Это наш тихий способ сказать «спасибо» — в виде баллов, которые можно тратить на средства, подходящие вашей коже.",
    bullets: [
      "5 баллов за каждый €1, потраченный на заказ",
      "150 баллов в день рождения каждый год",
      "250 бонусных баллов, как только приглашённый вами друг сделает первый заказ",
    ],
    referralLabel: "Ваш реферальный код",
    referralBody: (c) =>
      `Поделитесь этим кодом с другом. Он получит +5% к приветственной скидке, вы — бонус, как только он сделает заказ. Ваш код: ${c}`,
    cta: "Открыть A-Beauty Club",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type LoyaltyClubWelcomePayload = {
  email: string;
  firstName: string | null;
  locale: Locale;
  referralCode: string;
};

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendLoyaltyClubWelcomeEmail(
  payload: LoyaltyClubWelcomePayload,
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const accountUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/account`;

  const bullets = s.bullets
    .map(
      (b) =>
        `<li style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#3D3935;">${esc(b)}</li>`,
    )
    .join("");

  const html = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: payload.locale.toLowerCase(),
    body: `
      <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#121110;font-weight:400;">
        ${esc(s.heading(payload.firstName))}
      </h1>
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#3D3935;">
        ${esc(s.intro)}
      </p>
      <ul style="margin:0 0 28px 18px;padding:0;">${bullets}</ul>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px 0;border:1px solid rgba(26,26,26,0.12);">
        <tr>
          <td style="padding:18px 16px;">
            <p style="margin:0 0 4px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
              ${esc(s.referralLabel)}
            </p>
            <p style="margin:0 0 6px 0;font-family:'Courier New',monospace;font-size:18px;letter-spacing:0.16em;color:#121110;">
              ${esc(payload.referralCode)}
            </p>
            <p style="margin:0;font-size:12px;line-height:1.55;color:#6F6A65;">
              ${esc(s.referralBody(payload.referralCode))}
            </p>
          </td>
        </tr>
      </table>
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
      tags: [{ name: "type", value: "loyalty-club-welcome" }],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/loyalty-club-welcome] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}
