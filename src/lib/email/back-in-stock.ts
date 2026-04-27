// ─────────────────────────────────────────────────────────────────────────
// Back-in-stock email — fires once when a customer-subscribed variant
// transitions from out-of-stock to having stock again.
//
// One email per (email, variantId) pair, ever — the cron that triggers
// this stamps `notifiedAt` on the BackInStockSubscription row in the same
// transaction so we never double-send. The email links straight back to
// the PDP with a hint to re-add to cart.
//
// Localised EN / NL / FR / RU. Uses fromTransactional() + Reply-To: hello@
// so customers can reply with questions.
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
  subject: (productName: string) => string;
  preheader: (productName: string) => string;
  heading: (productName: string) => string;
  lede: string;
  variantLine: (label: string) => string;
  cta: string;
  signoff: string;
  footer: string;
  hurry: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n) => `${n} is back — YU.R Skin Solution`,
    preheader: (n) => `${n} is in stock again.`,
    heading: (n) => `${n} is back.`,
    lede: "You asked us to let you know — and here we are. Your size is in stock again, ready to head out the door.",
    variantLine: (l) => `Size: ${l}`,
    cta: "Return to the product",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
    hurry: "Stock is limited — first to the cart, first served.",
  },
  NL: {
    subject: (n) => `${n} is terug — YU.R Skin Solution`,
    preheader: (n) => `${n} is weer op voorraad.`,
    heading: (n) => `${n} is terug.`,
    lede: "Je had ons gevraagd je te laten weten — en hier zijn we. Je maat is weer op voorraad.",
    variantLine: (l) => `Maat: ${l}`,
    cta: "Terug naar het product",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
    hurry: "De voorraad is beperkt — wie eerst komt, eerst maalt.",
  },
  FR: {
    subject: (n) => `${n} est de retour — YU.R Skin Solution`,
    preheader: (n) => `${n} est de nouveau en stock.`,
    heading: (n) => `${n} est de retour.`,
    lede: "Vous nous aviez demandé de vous prévenir — voilà. Votre taille est de nouveau disponible.",
    variantLine: (l) => `Taille : ${l}`,
    cta: "Retour au produit",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
    hurry: "Le stock est limité — premier arrivé, premier servi.",
  },
  RU: {
    subject: (n) => `${n} снова в наличии — YU.R Skin Solution`,
    preheader: (n) => `${n} снова на складе.`,
    heading: (n) => `${n} снова в наличии.`,
    lede: "Вы попросили сообщить — и вот. Ваш размер снова в наличии.",
    variantLine: (l) => `Размер: ${l}`,
    cta: "Вернуться к продукту",
    signoff: "С заботой,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Бельгия",
    hurry: "Запас ограничен — успевайте, пока он есть.",
  },
};

// ────────── public types ────────────────────────────────────────────────

export type BackInStockPayload = {
  /** Recipient (the email that subscribed). */
  email: string;
  locale: Locale;
  productName: string;
  /** e.g. "30 ml" — null if there's only one default variant on the product. */
  variantLabel: string | null;
  /** Absolute URL to the PDP. We append no query params; the customer just
   *  picks the size again on the page. */
  productUrl: string;
};

export type BackInStockSendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

// ────────── send ────────────────────────────────────────────────────────

export async function sendBackInStockEmail(
  payload: BackInStockPayload,
): Promise<BackInStockSendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const s = STRINGS[payload.locale];
  const html = renderHtml(payload, s);

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: s.subject(payload.productName),
      html,
      headers: {
        // Quiet preheader — many inbox previews show this as the line
        // under the subject.
        "X-Entity-Ref-ID": `bis:${payload.email}:${payload.productName}`,
      },
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/back-in-stock] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}

// ────────── render ──────────────────────────────────────────────────────

function renderHtml(p: BackInStockPayload, s: Strings): string {
  const body = `
    <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6F6A65;">
      ${esc(s.preheader(p.productName))}
    </p>
    <h1 style="margin:0 0 24px 0;font-family:Georgia,serif;font-size:28px;line-height:1.25;color:#121110;font-weight:400;">
      ${esc(s.heading(p.productName))}
    </h1>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede)}
    </p>
    ${
      p.variantLabel
        ? `<p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#6F6A65;">${esc(s.variantLine(p.variantLabel))}</p>`
        : ""
    }
    <p style="margin:0 0 32px 0;font-size:13px;line-height:1.6;color:#6F6A65;font-style:italic;">
      ${esc(s.hurry)}
    </p>
    ${renderCtaButton(p.productUrl, s.cta)}
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  return renderEmailShell({
    title: s.subject(p.productName),
    preheader: s.preheader(p.productName),
    lang: p.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });
}
