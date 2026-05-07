// ─────────────────────────────────────────────────────────────────────────
// Birthday email — fired once per customer per year by the birthday
// cron. Soft, warm, brand-voice — Sofia greeting the customer + a
// personal-feeling discount code valid for 30 days.
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
  lede: string;
  codeLabel: string;
  codeNote: (percent: number) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "A small thing for your birthday",
    preheader: "From the Asian Beauty Shop team, with care.",
    heading: (f) =>
      f ? `Happy birthday, ${f}.` : "Happy birthday.",
    lede: "Thank you for letting us be a small part of your year. Here's a quiet something to mark the day — use whenever feels right.",
    codeLabel: "Your birthday code",
    codeNote: (p) => `${p}% off your next order. Single use, valid for 30 days.`,
    cta: "Browse the collection",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Een klein iets voor je verjaardag",
    preheader: "Van het Asian Beauty Shop-team, met zorg.",
    heading: (f) =>
      f ? `Fijne verjaardag, ${f}.` : "Fijne verjaardag.",
    lede: "Bedankt dat we een klein onderdeel van je jaar mogen zijn. Hier is iets rustigs om de dag te markeren — gebruik wanneer het goed voelt.",
    codeLabel: "Je verjaardagscode",
    codeNote: (p) => `${p}% korting op je volgende bestelling. Eenmalig, 30 dagen geldig.`,
    cta: "Bekijk de collectie",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Un petit quelque chose pour votre anniversaire",
    preheader: "De la part de l'équipe Asian Beauty Shop, avec attention.",
    heading: (f) =>
      f ? `Joyeux anniversaire, ${f}.` : "Joyeux anniversaire.",
    lede: "Merci de nous laisser faire partie de votre année. Voici un petit geste discret pour marquer cette journée — à utiliser quand vous le souhaitez.",
    codeLabel: "Votre code anniversaire",
    codeNote: (p) => `${p} % sur votre prochaine commande. Usage unique, valable 30 jours.`,
    cta: "Découvrir la collection",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Небольшой подарок ко дню рождения",
    preheader: "От команды Asian Beauty Shop, с заботой.",
    heading: (f) =>
      f ? `С днём рождения, ${f}.` : "С днём рождения.",
    lede: "Спасибо, что позволяете нам быть частью вашего года. Небольшой жест по случаю — используйте, когда удобно.",
    codeLabel: "Ваш код ко дню рождения",
    codeNote: (p) => `${p}% на следующий заказ. Одноразовый, действителен 30 дней.`,
    cta: "К коллекции",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type BirthdayEmailPayload = {
  email: string;
  firstName: string | null;
  locale: Locale;
  couponCode: string;
  percentOff: number;
};

export type BirthdayEmailResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendBirthdayEmail(
  payload: BirthdayEmailPayload,
): Promise<BirthdayEmailResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const shopUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/shop`;

  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading(payload.firstName))}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;border:1px solid rgba(26,26,26,0.12);">
      <tr>
        <td style="padding:20px 16px;text-align:center;">
          <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            ${esc(s.codeLabel)}
          </p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:22px;letter-spacing:0.18em;color:#121110;">
            ${esc(payload.couponCode)}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 28px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;text-align:center;">
      ${esc(s.codeNote(payload.percentOff))}
    </p>
    ${renderCtaButton(shopUrl, s.cta)}
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: payload.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: s.subject,
      html,
      tags: [
        { name: "type", value: "birthday" },
        { name: "coupon", value: payload.couponCode },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/birthday] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}
