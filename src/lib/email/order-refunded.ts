// ─────────────────────────────────────────────────────────────────────────
// Order refunded email — sent when Sofia issues a refund via
// issueRefundAction. Copy differs for full vs partial.
//
// The action already logs the refund to OrderEvent (kind:
// "refund.issued") with amount/currency/external in metadata. We read
// the amount from the caller (it's not on the Order row — Order only
// tracks paymentStatus + status). So `sendOrderRefundedEmail` takes
// orderId + amount + kind.
//
// Localised EN / NL / FR / RU. Amount formatting follows the order's
// locale via formatEmailMoney (e.g. "€ 24,50" for NL vs "€24.50" for EN).
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

export type RefundKind = "full" | "partial";

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (orderNo: string, kind: RefundKind) => string;
  preheader: (kind: RefundKind) => string;
  heading: (firstName: string | null, kind: RefundKind) => string;
  ledeFull: string;
  ledePartial: string;
  amountLabel: string;
  timingNote: string;
  cta: string;
  signoff: string;
  footer: string;
};

export const ORDER_REFUNDED_STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n, k) =>
      k === "full"
        ? `Your refund for ${n} is on its way — Asian Beauty Shop`
        : `A partial refund for ${n} has been issued — Asian Beauty Shop`,
    preheader: (k) =>
      k === "full" ? "Your refund is on its way." : "A partial refund has been issued.",
    heading: (f, k) => {
      const who = f ? `${f}, ` : "";
      return k === "full"
        ? `${who}your refund is on its way.`
        : `${who}we've issued a partial refund.`;
    },
    ledeFull:
      "We've refunded your order in full. The amount is on its way back to your original payment method.",
    ledePartial:
      "We've issued a partial refund on your order. The rest of your order remains as before.",
    amountLabel: "Refund amount",
    timingNote:
      "Most banks post the refund within 3–5 business days, though some can take a little longer.",
    cta: "View my order",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (n, k) =>
      k === "full"
        ? `Je terugbetaling voor ${n} is onderweg — Asian Beauty Shop`
        : `Gedeeltelijke terugbetaling voor ${n} — Asian Beauty Shop`,
    preheader: (k) =>
      k === "full"
        ? "Je terugbetaling is onderweg."
        : "Er is een gedeeltelijke terugbetaling uitgevoerd.",
    heading: (f, k) => {
      const who = f ? `${f}, ` : "";
      return k === "full"
        ? `${who}je terugbetaling is onderweg.`
        : `${who}we hebben een gedeeltelijke terugbetaling uitgevoerd.`;
    },
    ledeFull:
      "We hebben je bestelling volledig terugbetaald. Het bedrag is onderweg naar je oorspronkelijke betaalmethode.",
    ledePartial:
      "We hebben een gedeeltelijke terugbetaling op je bestelling uitgevoerd. De rest van je bestelling blijft ongewijzigd.",
    amountLabel: "Bedrag",
    timingNote:
      "De meeste banken verwerken terugbetalingen binnen 3–5 werkdagen; in sommige gevallen kan het iets langer duren.",
    cta: "Bestelling bekijken",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (n, k) =>
      k === "full"
        ? `Votre remboursement pour ${n} est en cours — Asian Beauty Shop`
        : `Remboursement partiel pour ${n} — Asian Beauty Shop`,
    preheader: (k) =>
      k === "full"
        ? "Votre remboursement est en cours."
        : "Un remboursement partiel a été émis.",
    heading: (f, k) => {
      const who = f ? `${f}, ` : "";
      return k === "full"
        ? `${who}votre remboursement est en cours.`
        : `${who}nous avons émis un remboursement partiel.`;
    },
    ledeFull:
      "Nous avons remboursé votre commande dans son intégralité. Le montant est en route vers votre moyen de paiement d'origine.",
    ledePartial:
      "Nous avons émis un remboursement partiel sur votre commande. Le reste de votre commande reste inchangé.",
    amountLabel: "Montant",
    timingNote:
      "La plupart des banques traitent le remboursement sous 3–5 jours ouvrés ; cela peut parfois être un peu plus long.",
    cta: "Voir ma commande",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (n, k) =>
      k === "full"
        ? `Возврат по заказу ${n} уже в пути — Asian Beauty Shop`
        : `Частичный возврат по заказу ${n} — Asian Beauty Shop`,
    preheader: (k) =>
      k === "full"
        ? "Ваш возврат уже в пути."
        : "Оформлен частичный возврат.",
    heading: (f, k) => {
      const who = f ? `${f}, ` : "";
      return k === "full"
        ? `${who}ваш возврат уже в пути.`
        : `${who}мы оформили частичный возврат.`;
    },
    ledeFull:
      "Мы полностью вернули оплату за ваш заказ. Сумма возвращается на исходный способ оплаты.",
    ledePartial:
      "Мы оформили частичный возврат по вашему заказу. Остальная часть заказа остаётся без изменений.",
    amountLabel: "Сумма",
    timingNote:
      "Обычно банки зачисляют возврат в течение 3–5 рабочих дней; иногда это занимает чуть больше времени.",
    cta: "Посмотреть заказ",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type OrderRefundedEmail = {
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

export function buildOrderRefundedEmail(
  order: EmailOrder,
  opts: { amount: number; kind: RefundKind; overrides?: EmailOverrides },
): OrderRefundedEmail {
  const s = applyOverrides(
    ORDER_REFUNDED_STRINGS[order.locale] ?? ORDER_REFUNDED_STRINGS.EN,
    opts.overrides,
  );
  const subject = s.subject(order.publicNumber, opts.kind);
  const money = formatEmailMoney(opts.amount, order.currency, order.locale);

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName, opts.kind))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(opts.kind === "full" ? s.ledeFull : s.ledePartial)}
    </p>

    <p style="margin:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)}
    </p>

    <div style="margin:0 0 24px 0;padding:14px 16px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
        ${esc(s.amountLabel)}
      </div>
      <div style="margin-top:6px;font-size:18px;color:#1A1A1A;">
        ${esc(money)}
      </div>
    </div>

    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#5E5751;">
      ${esc(s.timingNote)}
    </p>

    ${renderCtaButton(accountOrderUrl(order), s.cta)}

    ${EMAIL_HR}

    <p style="margin:0;font-size:14px;line-height:1.65;color:#1A1A1A;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: s.preheader(opts.kind),
    lang: order.locale.toLowerCase(),
    body,
    footerNote: s.footer,
    legalLine: BUSINESS_LEGAL_LINE,
  });

  const text = [
    s.heading(order.customerFirstName, opts.kind),
    "",
    opts.kind === "full" ? s.ledeFull : s.ledePartial,
    "",
    order.publicNumber,
    "",
    `${s.amountLabel}: ${money}`,
    "",
    s.timingNote,
    "",
    `${s.cta}: ${accountOrderUrl(order)}`,
    "",
    s.signoff,
  ].join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendOrderRefundedEmail(
  orderId: string,
  opts: { amount: number; kind: RefundKind },
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  const overrides = await getEmailOverrides("order-refunded", order.locale);
  const { subject, html, text } = buildOrderRefundedEmail(order, {
    ...opts,
    overrides,
  });

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] refunded email not sent (no RESEND_API_KEY) for ${order.publicNumber}`,
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
        { name: "type", value: "order_refunded" },
        { name: "kind", value: opts.kind },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for refunded ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
