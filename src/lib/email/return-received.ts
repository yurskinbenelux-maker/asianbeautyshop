// ─────────────────────────────────────────────────────────────────────────
// Return received email — sent when the parcel lands at the warehouse and
// Sofia marks it received in admin.
//
// This is the "we've got it, the refund is in motion" email. The actual
// "your money is back" email is order-refunded.ts, triggered once she
// files the refund in Mollie. We keep them separate because inspection
// can take a day or two and customers worry during the gap.
//
// Two outcomes are possible at inspection:
//   · inspectionOk       — the normal case, refund is queued
//   · inspectionNote     — item opened / seal broken / partial value loss,
//                          we flag it and let Sofia decide the amount
//
// We only send this template on the happy path (inspectionOk). The
// discretionary / partial-refund case goes through order-refunded.ts with
// kind: "partial" + an explanatory note Sofia writes in admin.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import { getOrderForEmail, type EmailOrder } from "./order-query";

// ────────── shared input ────────────────────────────────────────────────

export type RmaReceivedContext = {
  returnReference: string;
  items: Array<{ productName: string; quantity: number }>;
  /** Optional ISO date string of when the parcel landed. Defaults to now. */
  receivedAt?: Date;
};

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (ref: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  itemsLabel: string;
  receivedOnLabel: string;
  nextTitle: string;
  nextBody: string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (r) => `Your return has arrived — ${r}`,
    preheader: "Refund is in motion.",
    heading: (f) =>
      f ? `${f}, your parcel has landed.` : "Your parcel has landed.",
    lede:
      "The parcel has arrived at our warehouse and matched to your return. We're inspecting the items now.",
    itemsLabel: "Items received",
    receivedOnLabel: "Received on",
    nextTitle: "What happens next",
    nextBody:
      "As soon as inspection is complete we file the refund to your original payment method. EU law gives us 14 days — in practice it's almost always within two working days. You'll get a separate email the moment the refund is issued.",
    cta: "View my order",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussels, Belgium",
  },
  NL: {
    subject: (r) => `Je retour is aangekomen — ${r}`,
    preheader: "Terugbetaling is in gang gezet.",
    heading: (f) =>
      f ? `${f}, je pakket is aangekomen.` : "Je pakket is aangekomen.",
    lede:
      "Het pakket is in ons magazijn aangekomen en gekoppeld aan je retour. We zijn de artikelen nu aan het controleren.",
    itemsLabel: "Ontvangen artikelen",
    receivedOnLabel: "Ontvangen op",
    nextTitle: "Wat gebeurt er nu",
    nextBody:
      "Zodra de controle klaar is, starten we de terugbetaling via je oorspronkelijke betaalmethode. De Europese wet geeft ons 14 dagen — in de praktijk is het bijna altijd binnen twee werkdagen. Je krijgt een aparte mail zodra de terugbetaling is uitgevoerd.",
    cta: "Bestelling bekijken",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussel, België",
  },
  FR: {
    subject: (r) => `Votre retour est arrivé — ${r}`,
    preheader: "Le remboursement est en cours.",
    heading: (f) =>
      f ? `${f}, votre colis est arrivé.` : "Votre colis est arrivé.",
    lede:
      "Le colis est arrivé à notre entrepôt et a été associé à votre retour. Nous inspectons les articles.",
    itemsLabel: "Articles reçus",
    receivedOnLabel: "Reçu le",
    nextTitle: "La suite",
    nextBody:
      "Dès que l'inspection est terminée, nous lançons le remboursement sur votre moyen de paiement initial. La loi européenne nous laisse 14 jours — en pratique c'est presque toujours sous deux jours ouvrés. Vous recevrez un e-mail distinct dès l'émission du remboursement.",
    cta: "Voir ma commande",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Bruxelles, Belgique",
  },
  RU: {
    subject: (r) => `Ваш возврат прибыл — ${r}`,
    preheader: "Возврат средств уже в процессе.",
    heading: (f) =>
      f ? `${f}, посылка прибыла.` : "Посылка прибыла.",
    lede:
      "Посылка поступила на наш склад и сопоставлена с вашим возвратом. Сейчас проверяем товары.",
    itemsLabel: "Полученные товары",
    receivedOnLabel: "Получено",
    nextTitle: "Что дальше",
    nextBody:
      "Как только проверка будет завершена, мы запустим возврат средств на исходный способ оплаты. По европейскому закону у нас есть 14 дней — на практике это почти всегда в течение двух рабочих дней. Вы получите отдельное письмо в момент оформления возврата.",
    cta: "Посмотреть заказ",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Брюссель, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type ReturnReceivedEmail = {
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

function formatReceivedDate(d: Date, locale: Locale): string {
  const l =
    locale === Locale.NL
      ? "nl-NL"
      : locale === Locale.FR
        ? "fr-FR"
        : locale === Locale.RU
          ? "ru-RU"
          : "en-GB";
  try {
    return new Intl.DateTimeFormat(l, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function renderItemsTable(items: RmaReceivedContext["items"]): string {
  if (!items.length) return "";
  return /* html */ `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
      ${items
        .map(
          (it) => /* html */ `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid rgba(26,26,26,0.06);font-size:14px;color:#1A1A1A;">${esc(it.productName)}</td>
          <td align="right" style="padding:6px 0 6px 12px;border-bottom:1px solid rgba(26,26,26,0.06);font-size:13px;color:#5E5751;white-space:nowrap;">× ${it.quantity}</td>
        </tr>`,
        )
        .join("")}
    </table>`;
}

export function buildReturnReceivedEmail(
  order: EmailOrder,
  rma: RmaReceivedContext,
): ReturnReceivedEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(rma.returnReference);

  const receivedAt = rma.receivedAt ?? new Date();
  const receivedLabel = formatReceivedDate(receivedAt, order.locale);

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede)}
    </p>

    <p style="margin:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)} · ${esc(rma.returnReference)}
    </p>

    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(s.itemsLabel)}
    </div>
    ${renderItemsTable(rma.items)}

    <div style="margin:0 0 24px 0;padding:14px 16px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
        ${esc(s.receivedOnLabel)}
      </div>
      <div style="margin-top:6px;font-size:16px;color:#1A1A1A;">
        ${esc(receivedLabel)}
      </div>
    </div>

    <h2 style="margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.nextTitle)}
    </h2>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.nextBody)}
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
    `${order.publicNumber} · ${rma.returnReference}`,
    "",
    `${s.itemsLabel}:`,
    ...rma.items.map((it) => `  ${it.productName} × ${it.quantity}`),
    "",
    `${s.receivedOnLabel}: ${receivedLabel}`,
    "",
    s.nextTitle,
    s.nextBody,
    "",
    `${s.cta}: ${accountOrderUrl(order)}`,
    "",
    s.signoff,
  ].join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendReturnReceivedEmail(
  orderId: string,
  rma: RmaReceivedContext,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  const { subject, html, text } = buildReturnReceivedEmail(order, rma);

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] return-received email not sent (no RESEND_API_KEY) for ${order.publicNumber} / ${rma.returnReference}`,
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
        { name: "type", value: "return_received" },
        { name: "order", value: order.publicNumber },
        { name: "return", value: rma.returnReference },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for return-received ${order.publicNumber} / ${rma.returnReference}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
