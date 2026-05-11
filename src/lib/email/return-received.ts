// ─────────────────────────────────────────────────────────────────────────
// Return received email — sent when the parcel lands at the warehouse and
// an admin marks it received in admin.
//
// This is the "we've got it, the refund is in motion" email. The actual
// "your money is back" email is order-refunded.ts, triggered once Mollie
// confirms the refund as terminally processed. We keep them separate
// because inspection + Mollie processing can take a day or two and
// customers worry during the gap.
//
// Step 6 (2026-05): the email now mirrors the per-item adjudication
// admin makes on /admin/returns/[id]. Each returned line carries a
// decision — accept-and-refund at EUR amount, or reject with a reason
// ("Item missing from parcel", "Opened and used", "Non-refundable gift
// card", etc.) — and the email surfaces that decision verbatim so the
// language the customer reads matches what arrived at the warehouse
// AND why some lines aren't fully refunded.
//
// Layout:
//   · Heading + outcome-aware lede
//   · "We're refunding" section listing accepted lines with EUR each
//   · "We can't refund the following" section listing rejected lines
//     with their reason (only shown when at least one line was rejected)
//   · Total refund callout
//   · "What happens next" copy
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

export type RmaReceivedItem = {
  productName: string;
  quantity: number;
  /** EUR being refunded on this line. > 0 = accepted, 0 = rejected,
   *  null = legacy unadjudicated (treated as "accepted at unknown
   *  amount" — no per-line EUR shown). */
  acceptedRefundEur: number | null;
  /** Reason text shown to the customer for a rejected line.
   *  e.g. "Item missing from parcel", "Non-refundable gift card".
   *  Only used when acceptedRefundEur === 0. */
  rejectionReason: string | null;
};

export type RmaReceivedContext = {
  returnReference: string;
  items: RmaReceivedItem[];
  /** Sum of acceptedRefundEur across accepted lines, in EUR. Drives the
   *  total callout + outcome-aware lede. */
  refundTotalEur: number;
  /** Optional ISO date of when the parcel landed. Defaults to now. */
  receivedAt?: Date;
};

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (ref: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  /** Lede when every line was accepted at full amount. */
  ledeAllAccepted: string;
  /** Lede when some lines were accepted and at least one rejected. */
  ledeMixed: string;
  /** Lede on the (rare) case where every line was rejected. */
  ledeAllRejected: string;
  acceptedLabel: string;
  rejectedLabel: string;
  totalRefundLabel: string;
  receivedOnLabel: string;
  nextTitle: string;
  nextBody: string;
  nextBodyNoRefund: string;
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
    ledeAllAccepted:
      "The parcel has arrived at our warehouse and we've inspected each item. Everything is in order — your refund is on its way.",
    ledeMixed:
      "The parcel has arrived at our warehouse and we've inspected each item. We're refunding most of what you sent — full breakdown below, including the lines we weren't able to credit and the reason for each.",
    ledeAllRejected:
      "The parcel has arrived but we weren't able to refund the items inside. The reason for each line is shown below — please get in touch if you'd like us to take another look.",
    acceptedLabel: "Refunding",
    rejectedLabel: "Not refunded",
    totalRefundLabel: "Total refund",
    receivedOnLabel: "Received on",
    nextTitle: "What happens next",
    nextBody:
      "We've filed the refund to your original payment method. EU law gives us 14 days — in practice it's almost always within two working days. You'll get a separate email the moment the refund settles.",
    nextBodyNoRefund:
      "If you'd like us to reconsider any of the items above, just reply to this email and our team will take another look.",
    cta: "View my order",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (r) => `Je retour is aangekomen — ${r}`,
    preheader: "Terugbetaling is in gang gezet.",
    heading: (f) =>
      f ? `${f}, je pakket is aangekomen.` : "Je pakket is aangekomen.",
    ledeAllAccepted:
      "Het pakket is in ons magazijn aangekomen en we hebben elk artikel gecontroleerd. Alles is in orde — je terugbetaling is onderweg.",
    ledeMixed:
      "Het pakket is in ons magazijn aangekomen en we hebben elk artikel gecontroleerd. We betalen het grootste deel terug — het volledige overzicht staat hieronder, inclusief de regels die we niet konden crediteren en de reden voor elk.",
    ledeAllRejected:
      "Het pakket is aangekomen, maar we konden de artikelen niet terugbetalen. De reden voor elke regel staat hieronder — neem contact op als je wilt dat we het opnieuw bekijken.",
    acceptedLabel: "Terugbetaling",
    rejectedLabel: "Niet terugbetaald",
    totalRefundLabel: "Totale terugbetaling",
    receivedOnLabel: "Ontvangen op",
    nextTitle: "Wat gebeurt er nu",
    nextBody:
      "We hebben de terugbetaling via je oorspronkelijke betaalmethode aangevraagd. De Europese wet geeft ons 14 dagen — in de praktijk is het bijna altijd binnen twee werkdagen. Je krijgt een aparte mail zodra de terugbetaling is verwerkt.",
    nextBodyNoRefund:
      "Wil je dat we een van de bovenstaande artikelen opnieuw bekijken? Antwoord dan op deze mail — ons team kijkt er graag nog eens naar.",
    cta: "Bestelling bekijken",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (r) => `Votre retour est arrivé — ${r}`,
    preheader: "Le remboursement est en cours.",
    heading: (f) =>
      f ? `${f}, votre colis est arrivé.` : "Votre colis est arrivé.",
    ledeAllAccepted:
      "Le colis est arrivé à notre entrepôt et nous avons inspecté chaque article. Tout est en ordre — votre remboursement est en route.",
    ledeMixed:
      "Le colis est arrivé à notre entrepôt et nous avons inspecté chaque article. Nous remboursons l'essentiel — le détail complet ci-dessous, y compris les lignes que nous n'avons pas pu créditer et la raison pour chacune.",
    ledeAllRejected:
      "Le colis est arrivé mais nous n'avons pas pu rembourser les articles. La raison pour chaque ligne est indiquée ci-dessous — contactez-nous si vous souhaitez que nous réexaminions.",
    acceptedLabel: "Remboursement",
    rejectedLabel: "Non remboursé",
    totalRefundLabel: "Remboursement total",
    receivedOnLabel: "Reçu le",
    nextTitle: "La suite",
    nextBody:
      "Nous avons lancé le remboursement sur votre moyen de paiement initial. La loi européenne nous laisse 14 jours — en pratique c'est presque toujours sous deux jours ouvrés. Vous recevrez un e-mail distinct dès que le remboursement sera effectif.",
    nextBodyNoRefund:
      "Si vous souhaitez que nous réexaminions l'un des articles ci-dessus, répondez simplement à cet e-mail — notre équipe y jettera un nouveau coup d'œil.",
    cta: "Voir ma commande",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (r) => `Ваш возврат прибыл — ${r}`,
    preheader: "Возврат средств уже в процессе.",
    heading: (f) =>
      f ? `${f}, посылка прибыла.` : "Посылка прибыла.",
    ledeAllAccepted:
      "Посылка поступила на наш склад, и мы проверили каждый товар. Всё в порядке — возврат средств уже в пути.",
    ledeMixed:
      "Посылка поступила на наш склад, и мы проверили каждый товар. Возвращаем большую часть — полная разбивка ниже, включая позиции, которые мы не смогли вернуть, и причину для каждой.",
    ledeAllRejected:
      "Посылка прибыла, но мы не смогли вернуть средства за товары. Причина по каждой позиции указана ниже — напишите нам, если хотите, чтобы мы пересмотрели.",
    acceptedLabel: "Возврат средств",
    rejectedLabel: "Не возвращено",
    totalRefundLabel: "Итого к возврату",
    receivedOnLabel: "Получено",
    nextTitle: "Что дальше",
    nextBody:
      "Мы оформили возврат на исходный способ оплаты. По европейскому закону у нас есть 14 дней — на практике это почти всегда в течение двух рабочих дней. Вы получите отдельное письмо, как только возврат будет зачислен.",
    nextBodyNoRefund:
      "Если хотите, чтобы мы пересмотрели какие-либо из товаров выше — просто ответьте на это письмо, и наша команда посмотрит ещё раз.",
    cta: "Посмотреть заказ",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
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
    "https://asianbeautyshop.eu"
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

/**
 * Format EUR for inline display in the email body. We deliberately don't
 * use Intl.NumberFormat with a locale-specific currency display because
 * it inserts non-breaking-space + symbol variations that some mail clients
 * render as boxes. "€ 12.34" is universally readable in all four locales.
 */
function formatEur(n: number): string {
  return `€ ${n.toFixed(2)}`;
}

function classify(items: RmaReceivedItem[]): {
  accepted: RmaReceivedItem[];
  rejected: RmaReceivedItem[];
} {
  const accepted: RmaReceivedItem[] = [];
  const rejected: RmaReceivedItem[] = [];
  for (const it of items) {
    // null acceptedRefundEur = legacy unadjudicated row — treat as
    // accepted (the old generic email shape). 0 = explicit rejection.
    if (it.acceptedRefundEur === 0) {
      rejected.push(it);
    } else {
      accepted.push(it);
    }
  }
  return { accepted, rejected };
}

function renderAcceptedTable(items: RmaReceivedItem[]): string {
  if (!items.length) return "";
  return /* html */ `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
      ${items
        .map((it) => {
          const eurCell =
            it.acceptedRefundEur !== null && it.acceptedRefundEur > 0
              ? formatEur(it.acceptedRefundEur)
              : `× ${it.quantity}`;
          return /* html */ `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(26,26,26,0.06);font-size:14px;color:#1A1A1A;">
            ${esc(it.productName)}
            <span style="color:#8A8A8A;font-size:12px;"> · × ${it.quantity}</span>
          </td>
          <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid rgba(26,26,26,0.06);font-size:13px;color:#1A1A1A;white-space:nowrap;">${esc(eurCell)}</td>
        </tr>`;
        })
        .join("")}
    </table>`;
}

/** Rejected lines: product + reason, no monetary column (it's €0 by definition). */
function renderRejectedList(items: RmaReceivedItem[]): string {
  if (!items.length) return "";
  return /* html */ `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
      ${items
        .map(
          (it) => /* html */ `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(26,26,26,0.06);vertical-align:top;">
            <div style="font-size:14px;color:#1A1A1A;">${esc(it.productName)} <span style="color:#8A8A8A;font-size:12px;">· × ${it.quantity}</span></div>
            ${
              it.rejectionReason
                ? `<div style="margin-top:4px;font-size:12px;color:#8A4A4A;font-style:italic;">${esc(it.rejectionReason)}</div>`
                : ""
            }
          </td>
        </tr>`,
        )
        .join("")}
    </table>`;
}

function chooseLede(s: Strings, accepted: number, rejected: number): string {
  if (rejected === 0) return s.ledeAllAccepted;
  if (accepted === 0) return s.ledeAllRejected;
  return s.ledeMixed;
}

export function buildReturnReceivedEmail(
  order: EmailOrder,
  rma: RmaReceivedContext,
): ReturnReceivedEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(rma.returnReference);

  const receivedAt = rma.receivedAt ?? new Date();
  const receivedLabel = formatReceivedDate(receivedAt, order.locale);

  const { accepted, rejected } = classify(rma.items);
  const lede = chooseLede(s, accepted.length, rejected.length);
  const hasRefund = rma.refundTotalEur > 0;

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(lede)}
    </p>

    <p style="margin:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)} · ${esc(rma.returnReference)}
    </p>

    ${
      accepted.length > 0
        ? /* html */ `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5B7A3E;">
            ${esc(s.acceptedLabel)}
          </div>
          ${renderAcceptedTable(accepted)}
        `
        : ""
    }

    ${
      rejected.length > 0
        ? /* html */ `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A4A4A;">
            ${esc(s.rejectedLabel)}
          </div>
          ${renderRejectedList(rejected)}
        `
        : ""
    }

    ${
      hasRefund
        ? /* html */ `
          <div style="margin:8px 0 24px 0;padding:14px 16px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);">
            <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
              ${esc(s.totalRefundLabel)}
            </div>
            <div style="margin-top:4px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1A1A1A;">
              ${esc(formatEur(rma.refundTotalEur))}
            </div>
            <div style="margin-top:6px;font-size:12px;color:#5E5751;">
              ${esc(s.receivedOnLabel)}: ${esc(receivedLabel)}
            </div>
          </div>
        `
        : /* html */ `
          <div style="margin:8px 0 24px 0;padding:14px 16px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);">
            <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
              ${esc(s.receivedOnLabel)}
            </div>
            <div style="margin-top:6px;font-size:16px;color:#1A1A1A;">
              ${esc(receivedLabel)}
            </div>
          </div>
        `
    }

    <h2 style="margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.nextTitle)}
    </h2>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(hasRefund ? s.nextBody : s.nextBodyNoRefund)}
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

  // Plain-text alt — same structure as HTML so blind/screen-reader / text-only
  // clients get the full picture, including per-line EUR + rejection reasons.
  const textLines: string[] = [
    s.heading(order.customerFirstName),
    "",
    lede,
    "",
    `${order.publicNumber} · ${rma.returnReference}`,
    "",
  ];
  if (accepted.length > 0) {
    textLines.push(`${s.acceptedLabel}:`);
    for (const it of accepted) {
      const tail =
        it.acceptedRefundEur !== null && it.acceptedRefundEur > 0
          ? ` — ${formatEur(it.acceptedRefundEur)}`
          : "";
      textLines.push(`  ${it.productName} × ${it.quantity}${tail}`);
    }
    textLines.push("");
  }
  if (rejected.length > 0) {
    textLines.push(`${s.rejectedLabel}:`);
    for (const it of rejected) {
      const tail = it.rejectionReason ? ` — ${it.rejectionReason}` : "";
      textLines.push(`  ${it.productName} × ${it.quantity}${tail}`);
    }
    textLines.push("");
  }
  if (hasRefund) {
    textLines.push(`${s.totalRefundLabel}: ${formatEur(rma.refundTotalEur)}`);
    textLines.push("");
  }
  textLines.push(`${s.receivedOnLabel}: ${receivedLabel}`);
  textLines.push("");
  textLines.push(s.nextTitle);
  textLines.push(hasRefund ? s.nextBody : s.nextBodyNoRefund);
  textLines.push("");
  textLines.push(`${s.cta}: ${accountOrderUrl(order)}`);
  textLines.push("");
  textLines.push(s.signoff);

  return { subject, html, text: textLines.join("\n") };
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
