// ─────────────────────────────────────────────────────────────────────────
// Order shipped email — sent when Sofia marks an order SHIPPED
// (via markShippedAction or updateOrderStatusAction landing on SHIPPED).
//
// The tracking number is required by markShippedAction's schema, but
// the tracking URL is optional — some carriers (Bpost manual slips)
// don't have a friendly URL. The template renders cleanly either way.
//
// Localised EN / NL / FR / RU. Uses fromTransactional + hello@ Reply-To.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  getResend,
  fromTransactional,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import { getOrderForEmail, type EmailOrder } from "./order-query";

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (orderNo: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  trackingLabel: string;
  noTrackingLede: string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n) => `Your order ${n} is on its way — YU.R Skin Solution`,
    preheader: "Your parcel has left the studio.",
    heading: (f) => (f ? `${f}, your parcel is on its way.` : "Your parcel is on its way."),
    lede:
      "Your order has just been handed to the carrier. You can follow it with the tracking link below.",
    trackingLabel: "Tracking",
    noTrackingLede:
      "Your order has just been handed to the carrier. A tracking link will follow as soon as it's scanned into the network.",
    cta: "Track my parcel",
    signoff: "See you soon,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussels, Belgium",
  },
  NL: {
    subject: (n) => `Je bestelling ${n} is onderweg — YU.R Skin Solution`,
    preheader: "Je pakket heeft het atelier verlaten.",
    heading: (f) => (f ? `${f}, je pakket is onderweg.` : "Je pakket is onderweg."),
    lede:
      "Je bestelling is zojuist overhandigd aan de vervoerder. Je kunt het pakket volgen via de track-link hieronder.",
    trackingLabel: "Tracking",
    noTrackingLede:
      "Je bestelling is zojuist overhandigd aan de vervoerder. Een track-link volgt zodra het pakket is gescand in hun netwerk.",
    cta: "Pakket volgen",
    signoff: "Tot binnenkort,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussel, België",
  },
  FR: {
    subject: (n) => `Votre commande ${n} est en route — YU.R Skin Solution`,
    preheader: "Votre colis a quitté l'atelier.",
    heading: (f) => (f ? `${f}, votre colis est en route.` : "Votre colis est en route."),
    lede:
      "Votre commande vient d'être remise au transporteur. Suivez-la avec le lien ci-dessous.",
    trackingLabel: "Suivi",
    noTrackingLede:
      "Votre commande vient d'être remise au transporteur. Un lien de suivi vous parviendra dès qu'elle sera scannée dans leur réseau.",
    cta: "Suivre mon colis",
    signoff: "À très bientôt,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Bruxelles, Belgique",
  },
  RU: {
    subject: (n) => `Ваш заказ ${n} в пути — YU.R Skin Solution`,
    preheader: "Ваша посылка покинула ателье.",
    heading: (f) => (f ? `${f}, ваша посылка в пути.` : "Ваша посылка в пути."),
    lede:
      "Мы только что передали ваш заказ перевозчику. Вы можете отследить его по ссылке ниже.",
    trackingLabel: "Отслеживание",
    noTrackingLede:
      "Мы только что передали ваш заказ перевозчику. Ссылка для отслеживания появится, как только посылку зарегистрируют в сети.",
    cta: "Отследить посылку",
    signoff: "До скорого,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Брюссель, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type OrderShippedEmail = {
  subject: string;
  html: string;
  text: string;
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://yurskinsolution.eu"
  );
}

function accountOrderUrl(order: EmailOrder): string {
  const locale = order.locale.toLowerCase();
  return `${siteUrl()}/${locale}/account/orders/${encodeURIComponent(order.publicNumber)}`;
}

/**
 * Render the shipped email. Pure.
 */
export function buildOrderShippedEmail(order: EmailOrder): OrderShippedEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(order.publicNumber);

  const hasTracking = Boolean(order.trackingNumber);
  // If we have a tracking URL, the CTA goes there. If only a number, the
  // CTA falls back to the order page where the customer can see context.
  const primaryUrl = order.trackingUrl ?? accountOrderUrl(order);

  const trackingBlock = hasTracking
    ? /* html */ `
      <div style="margin:0 0 20px 0;padding:14px 16px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);">
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
          ${esc(s.trackingLabel)}
        </div>
        <div style="margin-top:6px;font-size:14px;color:#1A1A1A;word-break:break-all;">
          ${esc(order.trackingNumber ?? "")}
        </div>
      </div>`
    : "";

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(hasTracking ? s.lede : s.noTrackingLede)}
    </p>

    <p style="margin:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)}
    </p>

    ${trackingBlock}

    ${renderCtaButton(primaryUrl, s.cta)}

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
    hasTracking ? s.lede : s.noTrackingLede,
    "",
    order.publicNumber,
    "",
    hasTracking ? `${s.trackingLabel}: ${order.trackingNumber}` : null,
    `${s.cta}: ${primaryUrl}`,
    "",
    s.signoff,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendOrderShippedEmail(
  orderId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  const { subject, html, text } = buildOrderShippedEmail(order);

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] shipped email not sent (no RESEND_API_KEY) for ${order.publicNumber}`,
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
        { name: "type", value: "order_shipped" },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for shipped ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
