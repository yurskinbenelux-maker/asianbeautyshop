// ─────────────────────────────────────────────────────────────────────────
// Return rejected email — sent when an admin marks a return as REJECTED.
//
// REJECTED happens when the request falls outside policy (window expired,
// item used past the "right to inspect" threshold, suspected fraud).
// The customer needs a clear, kind, non-defensive note explaining that
// we can't accept this one and inviting them to reply if there's
// context we missed. Belgian consumer law (Code de droit économique
// VI.83) requires us to explain the reason — adminNotes carry that.
//
// Wired into transitionReturnAction's REJECTED branch (A8).
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import { getOrderForEmail, type EmailOrder } from "./order-query";

export type RmaRejectedContext = {
  returnReference: string;
  /** Free-text reason from admin notes — surfaced to the customer
   *  verbatim so legal "explain the rejection" requirement is met.
   *  null means we'll fall back to the generic copy. */
  adminNotes: string | null;
};

type Strings = {
  subject: (ref: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  reasonLabel: string;
  fallbackReason: string;
  nextTitle: string;
  nextBody: string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (r) => `About your return — ${r}`,
    preheader: "We weren't able to accept this return.",
    heading: (f) =>
      f ? `${f}, a note about your return.` : "A note about your return.",
    lede:
      "Thank you for getting in touch. After reviewing your request, we weren't able to accept this return.",
    reasonLabel: "The reason",
    fallbackReason:
      "The request fell outside our return policy. The full terms are linked from your order page.",
    nextTitle: "If something's been overlooked",
    nextBody:
      "Just reply to this email — every reply lands in our inbox and a real person reads it. If there's context we missed, we'll happily look again.",
    cta: "View my order",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (r) => `Over je retour — ${r}`,
    preheader: "We konden deze retour niet accepteren.",
    heading: (f) =>
      f ? `${f}, een bericht over je retour.` : "Een bericht over je retour.",
    lede:
      "Bedankt voor je bericht. Na beoordeling konden we deze retour niet accepteren.",
    reasonLabel: "De reden",
    fallbackReason:
      "Het verzoek viel buiten ons retourbeleid. Je vindt de volledige voorwaarden via je bestelpagina.",
    nextTitle: "Mocht er iets over het hoofd zijn gezien",
    nextBody:
      "Antwoord gewoon op deze e-mail — elke reactie komt bij ons binnen en wordt door een echt persoon gelezen. Als er context ontbrak, kijken we graag opnieuw.",
    cta: "Bekijk mijn bestelling",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (r) => `À propos de votre retour — ${r}`,
    preheader: "Nous n'avons pas pu accepter ce retour.",
    heading: (f) =>
      f
        ? `${f}, un mot au sujet de votre retour.`
        : "Un mot au sujet de votre retour.",
    lede:
      "Merci de nous avoir contactés. Après examen, nous n'avons pas pu accepter ce retour.",
    reasonLabel: "La raison",
    fallbackReason:
      "La demande sortait du cadre de notre politique de retour. Les conditions complètes sont accessibles depuis la page de votre commande.",
    nextTitle: "Si un détail nous a échappé",
    nextBody:
      "Répondez simplement à cet e-mail — chaque réponse arrive chez nous et est lue par une vraie personne. Si un contexte nous manquait, nous serons heureux de revoir la décision.",
    cta: "Voir ma commande",
    signoff: "Avec soin,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (r) => `О вашем возврате — ${r}`,
    preheader: "Мы не смогли принять этот возврат.",
    heading: (f) =>
      f ? `${f}, информация о вашем возврате.` : "Информация о вашем возврате.",
    lede:
      "Спасибо, что связались с нами. После рассмотрения мы не смогли принять этот возврат.",
    reasonLabel: "Причина",
    fallbackReason:
      "Заявка выходит за рамки нашей политики возврата. Полные условия доступны со страницы заказа.",
    nextTitle: "Если мы что-то упустили",
    nextBody:
      "Просто ответьте на это письмо — каждое сообщение попадает к нам, и его читает реальный человек. Если есть детали, которых мы не учли, мы охотно посмотрим ещё раз.",
    cta: "Посмотреть заказ",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселаар, Бельгия",
  },
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

export type ReturnRejectedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function buildReturnRejectedEmail(
  order: EmailOrder,
  rma: RmaRejectedContext,
): ReturnRejectedEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(rma.returnReference);
  const reason = rma.adminNotes?.trim() || s.fallbackReason;

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

    <div style="margin:0 0 24px 0;padding:16px 18px;background:#F3EDE3;border-left:3px solid #C8102E;">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
        ${esc(s.reasonLabel)}
      </div>
      <p style="margin:8px 0 0 0;font-size:14px;line-height:1.65;color:#1A1A1A;white-space:pre-line;">
        ${esc(reason)}
      </p>
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
    `${s.reasonLabel}:`,
    reason,
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

export async function sendReturnRejectedEmail(
  orderId: string,
  rma: RmaRejectedContext,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  const { subject, html, text } = buildReturnRejectedEmail(order, rma);

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] return-rejected email not sent (no RESEND_API_KEY) for ${order.publicNumber} / ${rma.returnReference}`,
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
        { name: "type", value: "return_rejected" },
        { name: "order", value: order.publicNumber },
        { name: "return", value: rma.returnReference },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for return-rejected ${order.publicNumber} / ${rma.returnReference}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
