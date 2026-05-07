// ─────────────────────────────────────────────────────────────────────────
// Order confirmation email — sent the moment paymentStatus flips to PAID.
//
// Customer-facing. Written in Sofia's voice: warm, understated, editorial.
// All copy localised (EN / NL / FR / RU) based on the order's locale.
//
// Exported helpers:
//   • buildOrderConfirmationEmail(order)  — pure builder (no side effects)
//   • sendOrderConfirmationEmail(orderId) — fetches order, sends via Resend
//
// The builder is kept pure so the admin panel can preview the rendered
// HTML later, and so we can snapshot-test the markup.
//
// We deliberately tolerate missing optional data (no shipping address, no
// product images, absent variant label). A failed email must never block
// the payment flow that triggered it — callers catch and log.
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
import {
  formatEmailMoney,
  getOrderForEmail,
  type EmailOrder,
} from "./order-query";

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (orderNo: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  /** Used when the order has zero physical items — replaces `lede`. */
  ledeDigital: string;
  orderLabel: string;
  itemsLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  shippingLabel: string;
  taxLabel: string;
  totalLabel: string;
  shippingAddressLabel: string;
  nextLabel: string;
  nextBody: string;
  /** Used when the order has zero physical items — replaces `nextBody`. */
  nextBodyDigital: string;
  cta: string;
  signoff: string;
  footer: string;
};

export const ORDER_CONFIRMATION_STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n) => `Your order ${n} is confirmed — YU.R Skin Solution`,
    preheader: "Thank you for your order. A skincare routine is on its way to you.",
    heading: (f) => (f ? `Thank you, ${f}.` : "Thank you."),
    lede:
      "Your order has been received and payment confirmed. We'll begin preparing it carefully — you'll hear from us again the moment it ships.",
    ledeDigital:
      "Your order has been received and payment confirmed. Your gift card code has been delivered to your inbox just now.",
    orderLabel: "Order",
    itemsLabel: "Your skincare routine",
    subtotalLabel: "Subtotal",
    discountLabel: "Discount",
    shippingLabel: "Shipping",
    taxLabel: "Tax",
    totalLabel: "Total",
    shippingAddressLabel: "Shipping to",
    nextLabel: "What happens next",
    nextBody:
      "We hand-pack every order in our studio in Aartselaar. Once your parcel is on the way, a tracking link will arrive here.",
    nextBodyDigital:
      "Your gift card code is in your inbox now. You can also see it any time in your account — codes apply at checkout, balances stack across orders.",
    cta: "View your order",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (n) => `Je bestelling ${n} is bevestigd — YU.R Skin Solution`,
    preheader: "Bedankt voor je bestelling. Je huidverzorgingsroutine is onderweg.",
    heading: (f) => (f ? `Bedankt, ${f}.` : "Bedankt."),
    lede:
      "Je bestelling is ontvangen en de betaling is bevestigd. We beginnen haar zorgvuldig klaar te maken — zodra ze verstuurd is, hoor je opnieuw van ons.",
    ledeDigital:
      "Je bestelling is ontvangen en de betaling is bevestigd. Je cadeaubon-code is zojuist in je inbox bezorgd.",
    orderLabel: "Bestelling",
    itemsLabel: "Jouw huidverzorgingsroutine",
    subtotalLabel: "Subtotaal",
    discountLabel: "Korting",
    shippingLabel: "Verzending",
    taxLabel: "Btw",
    totalLabel: "Totaal",
    shippingAddressLabel: "Verzending naar",
    nextLabel: "Wat nu",
    nextBody:
      "We pakken elk pakket met zorg in in ons atelier in Aartselaar. Zodra je pakket onderweg is, ontvang je hier een tracking-link.",
    nextBodyDigital:
      "Je cadeaubon-code staat nu in je inbox. Je kan hem ook altijd in je account bekijken — codes worden bij het afrekenen toegepast, en saldi blijven staan tussen bestellingen.",
    cta: "Bestelling bekijken",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (n) => `Votre commande ${n} est confirmée — YU.R Skin Solution`,
    preheader: "Merci pour votre commande. Un routine de soin est en route.",
    heading: (f) => (f ? `Merci, ${f}.` : "Merci."),
    lede:
      "Votre commande a bien été reçue et le paiement est confirmé. Nous allons la préparer avec soin — nous vous écrirons à nouveau dès qu'elle sera expédiée.",
    ledeDigital:
      "Votre commande a bien été reçue et le paiement est confirmé. Votre code carte cadeau vient d'être envoyé dans votre boîte mail.",
    orderLabel: "Commande",
    itemsLabel: "Votre routine de soin",
    subtotalLabel: "Sous-total",
    discountLabel: "Remise",
    shippingLabel: "Livraison",
    taxLabel: "TVA",
    totalLabel: "Total",
    shippingAddressLabel: "Livraison à",
    nextLabel: "Et ensuite",
    nextBody:
      "Chaque commande est emballée à la main dans notre atelier à Aartselaar. Dès que le colis est en route, un lien de suivi vous parviendra ici.",
    nextBodyDigital:
      "Votre code carte cadeau est dans votre boîte mail. Vous pouvez aussi le retrouver à tout moment dans votre compte — les codes s'appliquent en caisse, et le solde se conserve d'une commande à l'autre.",
    cta: "Voir ma commande",
    signoff: "Avec soin,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (n) => `Ваш заказ ${n} подтверждён — YU.R Skin Solution`,
    preheader: "Спасибо за заказ. Ваш рутина уже в пути.",
    heading: (f) => (f ? `Спасибо, ${f}.` : "Спасибо."),
    lede:
      "Мы получили ваш заказ, оплата подтверждена. Начинаем бережно его собирать — как только посылка отправится, вы получите от нас сообщение.",
    ledeDigital:
      "Мы получили ваш заказ, оплата подтверждена. Код подарочной карты только что отправлен на вашу почту.",
    orderLabel: "Заказ",
    itemsLabel: "Ваш рутина",
    subtotalLabel: "Сумма",
    discountLabel: "Скидка",
    shippingLabel: "Доставка",
    taxLabel: "Налог",
    totalLabel: "Итого",
    shippingAddressLabel: "Доставка по адресу",
    nextLabel: "Что дальше",
    nextBody:
      "Каждый заказ мы вручную упаковываем в нашем ателье в Артселаре. Как только посылка отправится, вы получите здесь трек-ссылку.",
    nextBodyDigital:
      "Код подарочной карты уже у вас в почте. Также вы всегда можете увидеть его в своём аккаунте — коды применяются при оформлении заказа, баланс сохраняется между покупками.",
    cta: "Посмотреть заказ",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type OrderConfirmationEmail = {
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
 * Render the order confirmation for one order. Pure: no DB, no network.
 *
 * `options.overrides` (optional) lets the caller patch any string field
 * with admin-edited copy fetched from `EmailCopyOverride`. Function
 * fields (`subject`, `heading`) are never replaced — they need their
 * dynamic placeholders to stay intact. See lib/email/copy-overrides.ts.
 */
export function buildOrderConfirmationEmail(
  order: EmailOrder,
  options?: { overrides?: EmailOverrides },
): OrderConfirmationEmail {
  const s = applyOverrides(
    ORDER_CONFIRMATION_STRINGS[order.locale] ?? ORDER_CONFIRMATION_STRINGS.EN,
    options?.overrides,
  );
  const subject = s.subject(order.publicNumber);
  const money = (n: number) =>
    formatEmailMoney(n, order.currency, order.locale);

  // True when every line is a gift card. Drives lede/nextBody copy and
  // hides the shipping address block + shipping line in the totals table.
  const isDigitalOnly =
    order.items.length > 0 && order.items.every((i) => i.kind === "GIFT_CARD");

  // ── items block ──
  const itemsRows = order.items
    .map((it) => {
      const thumb = it.imageUrl
        ? `<img src="${esc(it.imageUrl)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:1px solid rgba(26,26,26,0.08);object-fit:cover;" />`
        : `<div style="width:56px;height:56px;background:#EFE8DB;border:1px solid rgba(26,26,26,0.08);"></div>`;
      return /* html */ `
        <tr>
          <td style="padding:12px 0;vertical-align:top;">${thumb}</td>
          <td style="padding:12px 0 12px 14px;vertical-align:top;">
            <div style="font-size:14px;line-height:1.4;color:#1A1A1A;">${esc(it.productName)}</div>
            <div style="margin-top:2px;font-size:12px;color:#8A8A8A;">× ${it.quantity}</div>
          </td>
          <td align="right" style="padding:12px 0;vertical-align:top;font-size:14px;color:#1A1A1A;white-space:nowrap;">
            ${esc(money(it.lineTotal))}
          </td>
        </tr>`;
    })
    .join("");

  // ── totals block ──
  const totalRow = (
    label: string,
    value: string,
    emphasised = false,
  ) => /* html */ `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:${emphasised ? "#1A1A1A" : "#5E5751"};${emphasised ? "font-weight:500;" : ""}">${esc(label)}</td>
      <td align="right" style="padding:6px 0;font-size:13px;color:${emphasised ? "#1A1A1A" : "#5E5751"};${emphasised ? "font-weight:500;" : ""}">${esc(value)}</td>
    </tr>`;

  const totalsRows = [
    totalRow(s.subtotalLabel, money(order.subtotal)),
    order.discountTotal > 0
      ? totalRow(s.discountLabel, `− ${money(order.discountTotal)}`)
      : "",
    // Skip the shipping line entirely on digital-only orders — it's
    // always €0.00 there and including it would just confuse the reader.
    !isDigitalOnly ? totalRow(s.shippingLabel, money(order.shippingTotal)) : "",
    order.taxTotal > 0 ? totalRow(s.taxLabel, money(order.taxTotal)) : "",
    totalRow(s.totalLabel, money(order.grandTotal), true),
  ]
    .filter(Boolean)
    .join("");

  // ── shipping address block (optional) ──
  // Hidden on digital-only orders — there's no parcel routing to display
  // and including a "Shipping to" address would imply we're shipping
  // something physical.
  const addr = order.shippingAddress;
  const addressBlock = addr && !isDigitalOnly
    ? /* html */ `
      <div style="margin-top:24px;font-size:13px;line-height:1.6;color:#1A1A1A;">
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;margin-bottom:8px;">
          ${esc(s.shippingAddressLabel)}
        </div>
        ${esc([addr.firstName, addr.lastName].filter(Boolean).join(" "))}<br />
        ${esc(addr.line1)}${addr.line2 ? "<br />" + esc(addr.line2) : ""}<br />
        ${esc(addr.postcode)} ${esc(addr.city)}${addr.region ? ", " + esc(addr.region) : ""}<br />
        ${esc(addr.country)}
      </div>`
    : "";

  // ── body assembly ──
  const body = /* html */ `
    <h1 style="margin:28px 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(isDigitalOnly ? s.ledeDigital : s.lede)}
    </p>

    <p style="margin:0 0 24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(s.orderLabel)} · ${esc(order.publicNumber)}
    </p>

    ${EMAIL_HR}

    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;margin:0 0 8px 0;">
      ${esc(s.itemsLabel)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${itemsRows}
    </table>

    ${EMAIL_HR}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${totalsRows}
    </table>

    ${addressBlock}

    ${EMAIL_HR}

    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;margin:0 0 8px 0;">
      ${esc(s.nextLabel)}
    </div>
    <p style="margin:0 0 22px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(isDigitalOnly ? s.nextBodyDigital : s.nextBody)}
    </p>

    ${renderCtaButton(accountOrderUrl(order), s.cta)}

    <p style="margin:20px 0 0 0;font-size:14px;line-height:1.65;color:#1A1A1A;white-space:pre-line;">
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

  // Plain-text counterpart — every transactional mail should ship one.
  const text = [
    s.heading(order.customerFirstName),
    "",
    s.lede,
    "",
    `${s.orderLabel}: ${order.publicNumber}`,
    "",
    s.itemsLabel.toUpperCase(),
    ...order.items.map(
      (it) =>
        `  ${it.productName} × ${it.quantity}   ${money(it.lineTotal)}`,
    ),
    "",
    `${s.subtotalLabel}: ${money(order.subtotal)}`,
    order.discountTotal > 0
      ? `${s.discountLabel}: − ${money(order.discountTotal)}`
      : null,
    `${s.shippingLabel}: ${money(order.shippingTotal)}`,
    order.taxTotal > 0 ? `${s.taxLabel}: ${money(order.taxTotal)}` : null,
    `${s.totalLabel}: ${money(order.grandTotal)}`,
    "",
    addr
      ? `${s.shippingAddressLabel}:\n  ${[addr.firstName, addr.lastName].filter(Boolean).join(" ")}\n  ${addr.line1}${addr.line2 ? "\n  " + addr.line2 : ""}\n  ${addr.postcode} ${addr.city}${addr.region ? ", " + addr.region : ""}\n  ${addr.country}`
      : null,
    "",
    `${s.nextLabel}: ${s.nextBody}`,
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

/**
 * Fetch + render + send the confirmation email for an order.
 * Returns `{ sent: true }` on success, `{ sent: false, reason }` otherwise.
 *
 * Never throws — the payment/status pipelines upstream must keep flowing
 * even if email transport is down.
 */
/** Optional VAT-invoice PDF attachment — produced by the issue-invoice
 *  pipeline before this email fires. Resend takes attachments as a
 *  Buffer + filename so we forward them straight through. */
export type OrderConfirmationAttachment = {
  filename: string;
  content: Buffer;
};

export async function sendOrderConfirmationEmail(
  orderId: string,
  options: { invoicePdf?: OrderConfirmationAttachment } = {},
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  // Pull any admin-edited copy overrides for this email + locale.
  // Empty Map when Sofia hasn't tweaked anything → builder uses defaults.
  const overrides = await getEmailOverrides("order-confirmation", order.locale);
  const { subject, html, text } = buildOrderConfirmationEmail(order, { overrides });

  const client = getResend();
  if (!client) {
    // Dev / key not configured — log so we can still see what would have
    // been sent, but don't explode.
    console.warn(
      `[email] order confirmation not sent (no RESEND_API_KEY) for order ${order.publicNumber}`,
    );
    return { sent: false, reason: "resend-not-configured" };
  }

  // Resend accepts attachments as `{ filename, content }` where content
  // is either a Buffer or a base64 string. Buffer is what our PDF
  // pipeline produces, so we forward it directly.
  const attachments = options.invoicePdf
    ? [
        {
          filename: options.invoicePdf.filename,
          content: options.invoicePdf.content,
        },
      ]
    : undefined;

  try {
    await client.emails.send({
      from: fromTransactional(),
      to: order.email,
      subject,
      html,
      text,
      replyTo: replyToAddress(),
      attachments,
      // Tag outbound so we can filter bounces/complaints by email type
      // in the Resend dashboard (and in our webhook later).
      tags: [
        { name: "type", value: "order_confirmation" },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for order confirmation ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
