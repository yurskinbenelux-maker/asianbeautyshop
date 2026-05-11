// ─────────────────────────────────────────────────────────────────────────
// Order cancelled email — sent when an admin cancels an order via
// cancelOrderAction.
//
// Two shapes:
//
//   · WITHOUT refund context (PENDING orders, no money moved) — the
//     historical shape. Soft non-committal copy: "If your payment was
//     already captured, you'll see the refund shortly."
//
//   · WITH refund context (paid order cancelled + auto-refund fired) —
//     the 2026-05 shape. Shows the exact EUR being refunded, the admin's
//     typed reason verbatim, and the credit note reference. Matches the
//     legal reality: B2C cancellation refund is fired and Code de droit
//     économique VI.83's 14-day window is satisfied at minute zero.
//
// Localised EN / NL / FR / RU.
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
  /** Soft refund copy — used when no per-order refund was issued
   *  (the historical wording for PENDING-order cancels). */
  refundNote: string;
  /** Hard refund copy — used when this email is paired with a fired
   *  cancellation refund. Shows total + reason + CN ref. */
  refundIssuedTitle: string;
  refundAmountLabel: string;
  refundReasonLabel: string;
  refundCreditNoteLabel: string;
  refundIssuedFooter: string;
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
    refundIssuedTitle: "Refund issued",
    refundAmountLabel: "Amount",
    refundReasonLabel: "Reason",
    refundCreditNoteLabel: "Credit note",
    refundIssuedFooter:
      "The refund has been sent to your original payment method. It usually settles within two working days — your bank decides exact timing.",
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
    refundIssuedTitle: "Terugbetaling uitgevoerd",
    refundAmountLabel: "Bedrag",
    refundReasonLabel: "Reden",
    refundCreditNoteLabel: "Creditnota",
    refundIssuedFooter:
      "De terugbetaling is verstuurd naar je oorspronkelijke betaalmethode. Meestal is dit binnen twee werkdagen geregeld — de exacte timing bepaalt je bank.",
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
    refundIssuedTitle: "Remboursement effectué",
    refundAmountLabel: "Montant",
    refundReasonLabel: "Motif",
    refundCreditNoteLabel: "Note de crédit",
    refundIssuedFooter:
      "Le remboursement a été envoyé sur votre moyen de paiement initial. Il est généralement crédité sous deux jours ouvrés — votre banque fixe le délai exact.",
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
    refundIssuedTitle: "Возврат средств оформлен",
    refundAmountLabel: "Сумма",
    refundReasonLabel: "Причина",
    refundCreditNoteLabel: "Кредитная нота",
    refundIssuedFooter:
      "Возврат отправлен на исходный способ оплаты. Обычно средства поступают в течение двух рабочих дней — точный срок зависит от вашего банка.",
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

/**
 * Refund context for the "we cancelled AND refunded you" email shape.
 * Provided by cancelOrderAction when admin checks "Issue full refund".
 */
export type CancelRefundContext = {
  refundAmountEur: number;
  /** Admin's typed reason, shown verbatim to the customer. May be null
   *  if the admin didn't type one — copy degrades gracefully. */
  reasonNote: string | null;
  /** CN-2026-NNNNN reference for the credit note. */
  creditNoteNumber: string;
};

function formatEur(n: number): string {
  return `€ ${n.toFixed(2)}`;
}

/** Pure builder — returns subject/html/text for the cancellation email. */
export function buildOrderCancelledEmail(
  order: EmailOrder,
  options?: { overrides?: EmailOverrides; refund?: CancelRefundContext },
): OrderCancelledEmail {
  const s = applyOverrides(
    ORDER_CANCELLED_STRINGS[order.locale] ?? ORDER_CANCELLED_STRINGS.EN,
    options?.overrides,
  );
  const subject = s.subject(order.publicNumber);
  const refund = options?.refund ?? null;

  const refundBlockHtml = refund
    ? /* html */ `
      <div style="margin:0 0 24px 0;padding:16px 18px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);">
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;margin-bottom:10px;">
          ${esc(s.refundIssuedTitle)}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#5E5751;width:40%;">${esc(s.refundAmountLabel)}</td>
            <td align="right" style="padding:4px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1A1A1A;">${esc(formatEur(refund.refundAmountEur))}</td>
          </tr>
          ${
            refund.reasonNote
              ? `<tr>
            <td style="padding:4px 0;font-size:13px;color:#5E5751;vertical-align:top;">${esc(s.refundReasonLabel)}</td>
            <td align="right" style="padding:4px 0;font-size:13px;color:#1A1A1A;font-style:italic;">${esc(refund.reasonNote)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:4px 0;font-size:13px;color:#5E5751;">${esc(s.refundCreditNoteLabel)}</td>
            <td align="right" style="padding:4px 0;font-family:'Courier New',monospace;font-size:12px;color:#1A1A1A;">${esc(refund.creditNoteNumber)}</td>
          </tr>
        </table>
        <p style="margin:12px 0 0 0;font-size:12px;line-height:1.55;color:#5E5751;">
          ${esc(s.refundIssuedFooter)}
        </p>
      </div>`
    : /* html */ `
      <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#5E5751;">
        ${esc(s.refundNote)}
      </p>`;

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

    ${refundBlockHtml}

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

  const textLines: string[] = [
    s.heading(order.customerFirstName),
    "",
    s.lede,
    "",
    order.publicNumber,
    "",
  ];
  if (refund) {
    textLines.push(`${s.refundIssuedTitle}:`);
    textLines.push(`  ${s.refundAmountLabel}: ${formatEur(refund.refundAmountEur)}`);
    if (refund.reasonNote) {
      textLines.push(`  ${s.refundReasonLabel}: ${refund.reasonNote}`);
    }
    textLines.push(`  ${s.refundCreditNoteLabel}: ${refund.creditNoteNumber}`);
    textLines.push("");
    textLines.push(s.refundIssuedFooter);
  } else {
    textLines.push(s.refundNote);
  }
  textLines.push("");
  textLines.push(`${s.cta}: ${accountUrl(order)}`);
  textLines.push("");
  textLines.push(s.signoff);

  return { subject, html, text: textLines.join("\n") };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendOrderCancelledEmail(
  orderId: string,
  refund?: CancelRefundContext,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  const overrides = await getEmailOverrides("order-cancelled", order.locale);
  const { subject, html, text } = buildOrderCancelledEmail(order, {
    overrides,
    refund,
  });

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
