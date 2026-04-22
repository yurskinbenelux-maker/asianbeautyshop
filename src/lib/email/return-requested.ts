// ─────────────────────────────────────────────────────────────────────────
// Return requested email — sent to the customer the moment they submit a
// return via the (future) /account/orders/[id]/return form or after Sofia
// creates a return on their behalf from the admin.
//
// This is the "we've got your request — here's what's next" acknowledgement.
// The real logistics (label, address) come in `return-approved.ts` once
// Sofia has reviewed. We keep the two separate because:
//   · EU consumer law gives the customer 14 days to notify us — we want
//     to confirm that timer has been stopped the moment they write in.
//   · Labels often need a manual check (oversize parcels, cross-border,
//     partial returns) before we commit to sending one.
//
// Templates accept a slim RmaContext rather than a Return model — the
// Return table is being introduced in #93, and these functions are the
// contract that flow will fulfil.
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

/**
 * The slim shape callers pass in. Keep it independent of the future Return
 * model so this module can be swapped into place behind the real flow.
 */
export type RmaContext = {
  /** Public reference the customer sees, e.g. "YUR-1042-R1". */
  returnReference: string;
  /** Line items being returned. Subset of the order. */
  items: Array<{ productName: string; quantity: number }>;
  /** Optional free-text reason — surfaced in the admin notification only. */
  reason?: string | null;
};

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (ref: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  itemsLabel: string;
  whatNextTitle: string;
  whatNextBody: string;
  slaNote: string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (r) => `We've received your return request — ${r}`,
    preheader: "We'll reply within two working days with next steps.",
    heading: (f) =>
      f ? `${f}, we've got your return request.` : "We've got your return request.",
    lede:
      "Thank you for letting us know. We've logged your request and paused the 14-day withdrawal clock — you don't need to do anything else until we reply.",
    itemsLabel: "Items to return",
    whatNextTitle: "What happens next",
    whatNextBody:
      "Sofia reviews each return personally. Within two working days you'll receive a follow-up with your return reference, either a prepaid label or the return address, and packing instructions.",
    slaNote:
      "If you'd like to add a reason, a photo of a damaged product, or another item to the return, just reply to this email.",
    cta: "View my order",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussels, Belgium",
  },
  NL: {
    subject: (r) => `We hebben je retouraanvraag ontvangen — ${r}`,
    preheader: "We reageren binnen twee werkdagen met de volgende stappen.",
    heading: (f) =>
      f ? `${f}, we hebben je retouraanvraag ontvangen.` : "We hebben je retouraanvraag ontvangen.",
    lede:
      "Bedankt voor je bericht. We hebben je aanvraag geregistreerd en de herroepingstermijn van 14 dagen is nu stopgezet — je hoeft verder niets te doen totdat we reageren.",
    itemsLabel: "Te retourneren artikelen",
    whatNextTitle: "Wat gebeurt er nu",
    whatNextBody:
      "Sofia bekijkt elke retour persoonlijk. Binnen twee werkdagen ontvang je een vervolgmail met je retourreferentie, een retourlabel of adres, en inpakinstructies.",
    slaNote:
      "Wil je een reden, een foto van een beschadigd product of een extra artikel toevoegen? Antwoord gewoon op deze mail.",
    cta: "Bestelling bekijken",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussel, België",
  },
  FR: {
    subject: (r) => `Nous avons bien reçu votre demande de retour — ${r}`,
    preheader: "Nous revenons vers vous sous deux jours ouvrés avec les étapes suivantes.",
    heading: (f) =>
      f
        ? `${f}, nous avons bien reçu votre demande de retour.`
        : "Nous avons bien reçu votre demande de retour.",
    lede:
      "Merci pour votre message. Nous avons enregistré votre demande et mis en pause le délai de rétractation de 14 jours — vous n'avez rien d'autre à faire d'ici notre réponse.",
    itemsLabel: "Articles à retourner",
    whatNextTitle: "La suite",
    whatNextBody:
      "Sofia examine chaque retour personnellement. Sous deux jours ouvrés, vous recevrez un suivi avec votre référence de retour, une étiquette prépayée ou l'adresse de retour, et les instructions d'emballage.",
    slaNote:
      "Souhaitez-vous ajouter un motif, la photo d'un produit endommagé ou un autre article à la demande ? Répondez simplement à cet e-mail.",
    cta: "Voir ma commande",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Bruxelles, Belgique",
  },
  RU: {
    subject: (r) => `Мы получили вашу заявку на возврат — ${r}`,
    preheader: "Ответим в течение двух рабочих дней с дальнейшими шагами.",
    heading: (f) =>
      f
        ? `${f}, мы получили вашу заявку на возврат.`
        : "Мы получили вашу заявку на возврат.",
    lede:
      "Спасибо за обращение. Мы зарегистрировали заявку и приостановили 14-дневный срок отказа — до нашего ответа ничего делать не нужно.",
    itemsLabel: "Товары к возврату",
    whatNextTitle: "Что дальше",
    whatNextBody:
      "София рассматривает каждый возврат лично. В течение двух рабочих дней вы получите письмо с номером возврата, предоплаченной этикеткой или адресом, а также инструкциями по упаковке.",
    slaNote:
      "Хотите добавить причину, фото повреждённого товара или ещё один товар к возврату? Просто ответьте на это письмо.",
    cta: "Посмотреть заказ",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Брюссель, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type ReturnRequestedEmail = {
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

function renderItemsTable(items: RmaContext["items"]): string {
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

export function buildReturnRequestedEmail(
  order: EmailOrder,
  rma: RmaContext,
): ReturnRequestedEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(rma.returnReference);

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

    <h2 style="margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.whatNextTitle)}
    </h2>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.whatNextBody)}
    </p>

    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#5E5751;">
      ${esc(s.slaNote)}
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
    s.whatNextTitle,
    s.whatNextBody,
    "",
    s.slaNote,
    "",
    `${s.cta}: ${accountOrderUrl(order)}`,
    "",
    s.signoff,
  ].join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendReturnRequestedEmail(
  orderId: string,
  rma: RmaContext,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  const { subject, html, text } = buildReturnRequestedEmail(order, rma);

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] return-requested email not sent (no RESEND_API_KEY) for ${order.publicNumber} / ${rma.returnReference}`,
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
        { name: "type", value: "return_requested" },
        { name: "order", value: order.publicNumber },
        { name: "return", value: rma.returnReference },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for return-requested ${order.publicNumber} / ${rma.returnReference}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
