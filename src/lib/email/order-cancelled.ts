// ─────────────────────────────────────────────────────────────────────────
// Order cancelled email — sent when Sofia cancels an order via
// cancelOrderAction.
//
// Notes on copy:
//   • We deliberately do NOT forward the admin's internal `reason` string
//     to the customer. That field is for our audit trail ("chargeback
//     risk", "duplicate order", "customer ghost") and isn't always
//     customer-facing. If Sofia wants to explain, she can email manually.
//   • If the order had been paid, the refund happens via a separate
//     action (issueRefundAction) which triggers its own email. So here
//     we keep the wording soft and non-committal on refunds — "If your
//     payment was already captured, you'll see the refund shortly."
//
// Localised EN / NL / FR / RU. Same sender/reply-to as other
// transactional mails.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  getResend,
  fromTransactional,
  replyToAddress,
} from "./resend";
import { BUSINESS_LEGAL_LINE, EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
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
  refundNote: string;
  cta: string;
  signoff: string;
  footer: string;
};

export const ORDER_CANCELLED_STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n) => `Your order ${n} has been cancelled — Asian Beauty Shop`,
    preheader: "Your order has been cancelled.",
    heading: (f) =>
      f ? `${f}, your order has been cancelled.` : "Your order has been cancelled.",
    lede:
      "We wanted to let you know that your order has been cancelled. It won't be prepared or shipped.",
    refundNote:
      "If your payment was already captured, you'll see the refund on your statement within a few business days. If not, no charge has been made.",
    cta: "View my account",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (n) => `Je bestelling ${n} is geannuleerd — Asian Beauty Shop`,
    preheader: "Je bestelling is geannuleerd.",
    heading: (f) =>
      f ? `${f}, je bestelling is geannuleerd.` : "Je bestelling is geannuleerd.",
    lede:
      "We laten je weten dat je bestelling is geannuleerd. Ze wordt niet voorbereid of verzonden.",
    refundNote:
      "Als je betaling al was afgeschreven, zie je de terugbetaling binnen enkele werkdagen op je rekening. Zo niet, dan is er niets gedebiteerd.",
    cta: "Mijn account bekijken",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (n) => `Votre commande ${n} a été annulée — Asian Beauty Shop`,
    preheader: "Votre commande a été annulée.",
    heading: (f) =>
      f ? `${f}, votre commande a été annulée.` : "Votre commande a été annulée.",
    lede:
      "Nous souhaitions vous informer que votre commande a été annulée. Elle ne sera ni préparée ni expédiée.",
    refundNote:
      "Si le paiement avait déjà été capturé, vous verrez le remboursement sur votre relevé sous quelques jours ouvrés. Sinon, aucun prélèvement n'a été effectué.",
    cta: "Voir mon compte",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (n) => `Ваш заказ ${n} отменён — Asian Beauty Shop`,
    preheader: "Ваш заказ отменён.",
    heading: (f) =>
      f ? `${f}, ваш заказ отменён.` : "Ваш заказ отменён.",
    lede:
      "Сообщаем, что ваш заказ был отменён. Он не будет собран и отправлен.",
    refundNote:
      "Если платёж уже был списан, возврат средств отразится на выписке в течение нескольких рабочих дней. Если нет — списания не было.",
    cta: "Мой аккаунт",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type OrderCancelledEmail = {
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

function accountUrl(order: EmailOrder): string {
  const locale = order.locale.toLowerCase();
  return `${siteUrl()}/${locale}/account/orders/${encodeURIComponent(order.publicNumber)}`;
}

/** Pure builder — returns subject/html/text for the cancellation email. */
export function buildOrderCancelledEmail(
  order: EmailOrder,
  options?: { overrides?: EmailOverrides },
): OrderCancelledEmail {
  const s = applyOverrides(
    ORDER_CANCELLED_STRINGS[order.locale] ?? ORDER_CANCELLED_STRINGS.EN,
    options?.overrides,
  );
  const subject = s.subject(order.publicNumber);

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede)}
    </p>

    <p style="margin:0 0 24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)}
    </p>

    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#5E5751;">
      ${esc(s.refundNote)}
    </p>

    ${renderCtaButton(accountUrl(order), s.cta)}

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
    legalLine: BUSINESS_LEGAL_LINE,
  });

  const text = [
    s.heading(order.customerFirstName),
    "",
    s.lede,
    "",
    order.publicNumber,
    "",
    s.refundNote,
    "",
    `${s.cta}: ${accountUrl(order)}`,
    "",
    s.signoff,
  ].join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendOrderCancelledEmail(
  orderId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  const overrides = await getEmailOverrides("order-cancelled", order.locale);
  const { subject, html, text } = buildOrderCancelledEmail(order, { overrides });

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] cancelled email not sent (no RESEND_API_KEY) for ${order.publicNumber}`,
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
        { name: "type", value: "order_cancelled" },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for cancelled ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
