// ─────────────────────────────────────────────────────────────────────────
// Post-purchase review request email — sent ~14 days after delivery.
//
// One email per order (not per product). The email links to the account
// order page where each item has a "leave a review" entry point. This
// keeps the review writing experience consolidated and avoids sending
// five separate emails to someone who bought five things.
//
// Localised EN / NL / FR / RU. Uses fromTransactional() + hello@ Reply-To
// (so replies go to an admin if the customer has something to say).
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  getResend,
  fromTransactional,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import {
  applyOverrides,
  getEmailOverrides,
  type EmailOverrides,
} from "./copy-overrides";
import { getOrderForEmail, type EmailOrder } from "./order-query";

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (orderNo: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  incentive: string;
  cta: string;
  signoff: string;
  footer: string;
};

export const REVIEW_REQUEST_STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n) => `How did your ${n} skincare routine go? — Asian Beauty Shop`,
    preheader: "Share a few words about your products.",
    heading: (f) =>
      f ? `${f}, how did it go?` : "How did it go?",
    lede:
      "It's been a couple of weeks since your order arrived. We'd love to hear how the products have felt on your skin. A short review helps others find the right skincare routine — and tells us what's working.",
    incentive:
      "A few honest lines is plenty. No forms, no pressure — just your words.",
    cta: "Leave a review",
    signoff: "Thank you,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (n) => `Hoe bevielen de producten uit ${n}? — Asian Beauty Shop`,
    preheader: "Deel je ervaring met je producten.",
    heading: (f) =>
      f ? `${f}, hoe was het?` : "Hoe was het?",
    lede:
      "Het is inmiddels een paar weken geleden dat je bestelling is aangekomen. We horen graag hoe de producten op je huid voelen. Een korte review helpt anderen om de juiste huidverzorgingsroutine te vinden.",
    incentive:
      "Een paar eerlijke zinnen is ruim voldoende. Geen formulieren, geen druk — gewoon jouw woorden.",
    cta: "Review achterlaten",
    signoff: "Bedankt,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (n) => `Comment s'est passé votre routine de soin ${n} ? — Asian Beauty Shop`,
    preheader: "Partagez votre expérience en quelques mots.",
    heading: (f) =>
      f ? `${f}, comment ça s'est passé ?` : "Comment ça s'est passé ?",
    lede:
      "Cela fait maintenant quelques semaines que votre commande est arrivée. Nous aimerions savoir comment les produits se sont comportés sur votre peau. Quelques lignes aident d'autres à trouver le bon routine de soin.",
    incentive:
      "Quelques mots sincères suffisent. Pas de formulaire, aucune pression — juste votre ressenti.",
    cta: "Laisser un avis",
    signoff: "Merci,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (n) => `Как прошёл ваш рутина по заказу ${n}? — Asian Beauty Shop`,
    preheader: "Поделитесь впечатлениями от продуктов.",
    heading: (f) =>
      f ? `${f}, как впечатления?` : "Как впечатления?",
    lede:
      "Прошло пару недель с момента получения заказа. Нам важно знать, как продукты проявили себя на вашей коже. Короткий отзыв поможет другим найти свой рутина.",
    incentive:
      "Достаточно нескольких искренних строк. Без форм и давления — просто ваши слова.",
    cta: "Оставить отзыв",
    signoff: "Благодарю,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type ReviewRequestEmail = {
  subject: string;
  html: string;
  text: string;
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

function accountOrderUrl(order: EmailOrder): string {
  const locale = order.locale.toLowerCase();
  return `${siteUrl()}/${locale}/account/orders/${encodeURIComponent(order.publicNumber)}`;
}

/** Pure builder — returns subject/html/text for the review-request email. */
export function buildReviewRequestEmail(
  order: EmailOrder,
  options?: { overrides?: EmailOverrides },
): ReviewRequestEmail {
  const s = applyOverrides(
    REVIEW_REQUEST_STRINGS[order.locale] ?? REVIEW_REQUEST_STRINGS.EN,
    options?.overrides,
  );
  const subject = s.subject(order.publicNumber);

  // Small item roster so the customer remembers which products this is
  // about. Three max — for longer orders we trim and add "and others".
  const MAX_ITEMS = 3;
  const visible = order.items.slice(0, MAX_ITEMS);
  const extra = order.items.length - visible.length;

  const itemsHtml = visible
    .map(
      (it) => /* html */ `
      <li style="margin:4px 0;font-size:14px;color:#1A1A1A;">
        ${esc(it.productName)}
      </li>`,
    )
    .join("");

  const overflowHtml =
    extra > 0
      ? /* html */ `
      <li style="margin:4px 0;font-size:13px;color:#8A8A8A;font-style:italic;">
        ${esc(
          order.locale === Locale.NL
            ? `en ${extra} andere`
            : order.locale === Locale.FR
              ? `et ${extra} autre(s)`
              : order.locale === Locale.RU
                ? `и ещё ${extra}`
                : `and ${extra} more`,
        )}
      </li>`
      : "";

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede)}
    </p>

    <ul style="margin:0 0 20px 0;padding-left:18px;">
      ${itemsHtml}
      ${overflowHtml}
    </ul>

    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#5E5751;">
      ${esc(s.incentive)}
    </p>

    ${renderCtaButton(accountOrderUrl(order), s.cta)}

    ${EMAIL_HR}

    <p style="margin:0;font-size:14px;line-height:1.65;color:#1A1A1A;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: s.preheader,
    lang: order.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });

  const text = [
    s.heading(order.customerFirstName),
    "",
    s.lede,
    "",
    ...visible.map((it) => `• ${it.productName}`),
    extra > 0 ? `• …+${extra}` : null,
    "",
    s.incentive,
    "",
    `${s.cta}: ${accountOrderUrl(order)}`,
    "",
    s.signoff,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendReviewRequestEmail(
  orderId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  const overrides = await getEmailOverrides("review-request", order.locale);
  const { subject, html, text } = buildReviewRequestEmail(order, { overrides });

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] review-request email not sent (no RESEND_API_KEY) for ${order.publicNumber}`,
    );
    return { sent: false, reason: "resend-not-configured" };
  }

  try {
    await client.emails.send({
      from: fromTransactional(),
      to: order.email,
      subject,
      html,
      text,
      replyTo: replyToAddress(),
      tags: [
        { name: "type", value: "review_request" },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for review-request ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
