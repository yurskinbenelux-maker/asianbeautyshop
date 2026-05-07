// ─────────────────────────────────────────────────────────────────────────
// Newsletter welcome — sent ONCE per subscriber, immediately after they
// confirm via the double-opt-in link. Carries a single-use 10% coupon
// that's freshly minted at send time (see mintWelcomeCoupon below).
//
// Tone: warm but quiet. The discount is the carrot but the email
// shouldn't feel transactional — it's the first proper hello from the
// brand. Localised EN / NL / FR / RU.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: string;
  preheader: string;
  heading: string;
  lede: string;
  codeLabel: string;
  codeNote: (percent: number) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Welcome to Asian Beauty Shop — your 10% is inside",
    preheader: "Your code is waiting, and so is the ritual.",
    heading: "Welcome.",
    lede: "Thank you for joining us. Once a month we share quiet ideas about Korean skincare — what we're loving, what we're learning, and how to make a routine feel like a ritual rather than a chore.",
    codeLabel: "Your welcome code",
    codeNote: (p) => `Use it once for ${p}% off your first order. Valid for 60 days.`,
    cta: "Begin a ritual",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Welkom bij Asian Beauty Shop — je 10% zit binnenin",
    preheader: "Je code wacht, net als het ritueel.",
    heading: "Welkom.",
    lede: "Bedankt dat je je bij ons aansluit. Eens per maand delen we rustige gedachten over Koreaanse huidverzorging — wat we mooi vinden, wat we leren, en hoe een routine als een ritueel kan voelen.",
    codeLabel: "Je welkomstcode",
    codeNote: (p) => `Eenmalig te gebruiken voor ${p}% korting op je eerste bestelling. 60 dagen geldig.`,
    cta: "Begin een ritueel",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Bienvenue chez Asian Beauty Shop — vos 10 % sont à l'intérieur",
    preheader: "Votre code vous attend, comme le rituel.",
    heading: "Bienvenue.",
    lede: "Merci de vous joindre à nous. Une fois par mois, nous partageons des réflexions discrètes sur les soins coréens — ce que nous aimons, ce que nous apprenons, et comment transformer une routine en rituel.",
    codeLabel: "Votre code de bienvenue",
    codeNote: (p) => `À utiliser une fois pour ${p} % de réduction sur votre première commande. Valable 60 jours.`,
    cta: "Commencer un rituel",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Добро пожаловать в Asian Beauty Shop — ваши 10% внутри",
    preheader: "Код ждёт вас, как и ритуал.",
    heading: "Добро пожаловать.",
    lede: "Благодарим за подписку. Раз в месяц мы делимся тихими мыслями о корейском уходе за кожей — тем, что нам нравится, тем, что мы узнаём, и тем, как превратить рутину в ритуал.",
    codeLabel: "Ваш приветственный код",
    codeNote: (p) => `Действует один раз и даёт ${p}% скидки на первый заказ. Срок — 60 дней.`,
    cta: "Начать ритуал",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

// ────────── send ────────────────────────────────────────────────────────

export type NewsletterWelcomePayload = {
  email: string;
  locale: Locale;
  couponCode: string;
  /** Percent off (e.g. 10). Used in the email body copy + CTA hint. */
  percentOff: number;
};

export type NewsletterWelcomeSendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

export async function sendNewsletterWelcomeEmail(
  payload: NewsletterWelcomePayload,
): Promise<NewsletterWelcomeSendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const shopUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/shop`;
  const html = renderHtml(payload, s, shopUrl);

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: s.subject,
      html,
      tags: [
        { name: "type", value: "newsletter_welcome" },
        { name: "coupon", value: payload.couponCode },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/newsletter-welcome] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}

// ────────── render ──────────────────────────────────────────────────────

function renderHtml(
  p: NewsletterWelcomePayload,
  s: Strings,
  shopUrl: string,
): string {
  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede)}
    </p>
    <!-- Coupon block — bordered, centered, monospace code so it's
         scannable + copy-paste friendly. The note below explains the
         rules in fine print. -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;border:1px solid rgba(26,26,26,0.12);">
      <tr>
        <td style="padding:20px 16px;text-align:center;">
          <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            ${esc(s.codeLabel)}
          </p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:22px;letter-spacing:0.18em;color:#121110;">
            ${esc(p.couponCode)}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 28px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;text-align:center;">
      ${esc(s.codeNote(p.percentOff))}
    </p>
    ${renderCtaButton(shopUrl, s.cta)}
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  return renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: p.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });
}
