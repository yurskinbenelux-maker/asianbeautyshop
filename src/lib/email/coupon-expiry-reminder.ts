// ─────────────────────────────────────────────────────────────────────────
// Coupon expiry reminder — a soft 7-days-out nudge for personal coupons
// (welcome, referral, loyalty redemptions) that the customer hasn't
// burned yet. Triggered by /api/cron/coupon-expiry-reminder.
//
// Why this exists:
//   Multiple-coupon flows (welcome 10% + referral 5%, both per-user, no
//   stacking) only convert if the customer remembers to use the second
//   one on a SECOND order. The reminder email is the nudge that turns
//   "I have a coupon somewhere" into "I should buy that thing now".
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
  subject: (days: number) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: (days: number) => string;
  codeLabel: string;
  codeNote: (label: string) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (d) => `A reminder — your code expires in ${d} day${d === 1 ? "" : "s"}`,
    preheader: "A small thing waiting for you.",
    heading: (f) =>
      f
        ? `${f}, your code is still here.`
        : "Your code is still here.",
    lede: (d) =>
      `A gentle reminder — the code below expires in ${d} day${d === 1 ? "" : "s"}. No pressure; just letting you know it's waiting if the moment feels right.`,
    codeLabel: "Your code",
    codeNote: (label) => label,
    cta: "Browse the collection",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (d) => `Reminder — je code verloopt over ${d} dag${d === 1 ? "" : "en"}`,
    preheader: "Een klein iets dat op je wacht.",
    heading: (f) =>
      f ? `${f}, je code wacht nog op je.` : "Je code wacht nog op je.",
    lede: (d) =>
      `Een vriendelijke reminder — de code hieronder verloopt over ${d} dag${d === 1 ? "" : "en"}. Geen druk; we laten je gewoon weten dat het er nog is.`,
    codeLabel: "Je code",
    codeNote: (label) => label,
    cta: "Bekijk de collectie",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (d) => `Rappel — votre code expire dans ${d} jour${d === 1 ? "" : "s"}`,
    preheader: "Un petit quelque chose qui vous attend.",
    heading: (f) =>
      f ? `${f}, votre code est toujours là.` : "Votre code est toujours là.",
    lede: (d) =>
      `Un rappel discret — le code ci-dessous expire dans ${d} jour${d === 1 ? "" : "s"}. Aucune pression ; juste un signe pour vous dire qu'il vous attend.`,
    codeLabel: "Votre code",
    codeNote: (label) => label,
    cta: "Découvrir la collection",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (d) => `Напоминание — ваш код истекает через ${d} ${d === 1 ? "день" : "дн."}`,
    preheader: "Небольшой жест, который ждёт вас.",
    heading: (f) =>
      f ? `${f}, ваш код всё ещё здесь.` : "Ваш код всё ещё здесь.",
    lede: (d) =>
      `Небольшое напоминание — код ниже истекает через ${d} ${d === 1 ? "день" : "дн."}. Без давления — просто чтобы знали, что он вас ждёт.`,
    codeLabel: "Ваш код",
    codeNote: (label) => label,
    cta: "К коллекции",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type CouponExpiryEmailPayload = {
  email: string;
  firstName: string | null;
  locale: Locale;
  couponCode: string;
  /** Human-readable description of the coupon, e.g. "10% off any order"
   *  or "€5 off". Built by the cron from the Coupon row. */
  couponLabel: string;
  daysUntilExpiry: number;
};

export type CouponExpiryEmailResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendCouponExpiryReminderEmail(
  payload: CouponExpiryEmailPayload,
): Promise<CouponExpiryEmailResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://yurskinsolution.eu";
  const shopUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/shop`;

  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading(payload.firstName))}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede(payload.daysUntilExpiry))}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;border:1px solid rgba(26,26,26,0.12);">
      <tr>
        <td style="padding:20px 16px;text-align:center;">
          <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            ${esc(s.codeLabel)}
          </p>
          <p style="margin:0 0 6px 0;font-family:'Courier New',monospace;font-size:22px;letter-spacing:0.18em;color:#121110;">
            ${esc(payload.couponCode)}
          </p>
          <p style="margin:0;font-size:12px;color:#6F6A65;font-style:italic;">
            ${esc(s.codeNote(payload.couponLabel))}
          </p>
        </td>
      </tr>
    </table>
    ${renderCtaButton(shopUrl, s.cta)}
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: s.subject(payload.daysUntilExpiry),
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
      subject: s.subject(payload.daysUntilExpiry),
      html,
      tags: [
        { name: "type", value: "coupon-expiry-reminder" },
        { name: "coupon", value: payload.couponCode },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/coupon-expiry-reminder] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}
