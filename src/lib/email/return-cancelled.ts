// ─────────────────────────────────────────────────────────────────────────
// Return cancelled email — sent when a return is moved to CANCELLED.
//
// Two paths land here:
//   · Customer self-cancels via /[locale]/account/returns/[number] while
//     the request is still REQUESTED. The customer triggered the action
//     but a confirmation email is still helpful — gives them a record
//     and reassures that nothing will happen to the order.
//   · Admin cancels from /admin/returns/[id] (e.g. customer asked us
//     by phone or email to drop the return). Same email applies.
//
// The transitionReturnAction wires this on every successful CANCELLED
// transition; the customer-self-cancel path goes through the same
// transition helper, so one wire-up covers both.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import { getOrderForEmail, type EmailOrder } from "./order-query";

export type RmaCancelledContext = {
  returnReference: string;
};

type Strings = {
  subject: (ref: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  reassureTitle: string;
  reassureBody: string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (r) => `Return cancelled — ${r}`,
    preheader: "We've cancelled this return.",
    heading: (f) =>
      f ? `${f}, your return is cancelled.` : "Your return is cancelled.",
    lede:
      "We've cancelled this return request. Your order itself stays as it was — nothing is being refunded or shipped back.",
    reassureTitle: "Changed your mind again?",
    reassureBody:
      "If you'd still like to return something within our 14-day window, just submit a new request from the order page — it takes a moment.",
    cta: "View my order",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: (r) => `Retour geannuleerd — ${r}`,
    preheader: "We hebben deze retour geannuleerd.",
    heading: (f) =>
      f ? `${f}, je retour is geannuleerd.` : "Je retour is geannuleerd.",
    lede:
      "We hebben dit retourverzoek geannuleerd. Je bestelling zelf blijft zoals hij was — er wordt niets terugbetaald of teruggestuurd.",
    reassureTitle: "Toch weer van gedachten veranderd?",
    reassureBody:
      "Als je binnen onze termijn van 14 dagen alsnog iets wilt retourneren, dien dan een nieuw verzoek in vanaf de bestelpagina — het duurt maar een momentje.",
    cta: "Bekijk mijn bestelling",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: (r) => `Retour annulé — ${r}`,
    preheader: "Nous avons annulé ce retour.",
    heading: (f) =>
      f ? `${f}, votre retour est annulé.` : "Votre retour est annulé.",
    lede:
      "Nous avons annulé cette demande de retour. Votre commande reste telle quelle — rien n'est remboursé ni renvoyé.",
    reassureTitle: "Vous avez encore changé d'avis ?",
    reassureBody:
      "Si vous souhaitez tout de même retourner un article dans notre fenêtre de 14 jours, soumettez une nouvelle demande depuis la page de la commande — c'est l'affaire d'un instant.",
    cta: "Voir ma commande",
    signoff: "Avec soin,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: (r) => `Возврат отменён — ${r}`,
    preheader: "Мы отменили этот возврат.",
    heading: (f) =>
      f ? `${f}, ваш возврат отменён.` : "Ваш возврат отменён.",
    lede:
      "Мы отменили эту заявку на возврат. Сам заказ остаётся как был — ничего не возвращается и не отправляется обратно.",
    reassureTitle: "Снова передумали?",
    reassureBody:
      "Если в течение 14-дневного срока вы захотите всё-таки вернуть что-то — просто подайте новую заявку со страницы заказа, это займёт минуту.",
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

export type ReturnCancelledEmail = {
  subject: string;
  html: string;
  text: string;
};

export function buildReturnCancelledEmail(
  order: EmailOrder,
  rma: RmaCancelledContext,
): ReturnCancelledEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(rma.returnReference);

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede)}
    </p>

    <p style="margin:0 0 24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)} · ${esc(rma.returnReference)}
    </p>

    <h2 style="margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.reassureTitle)}
    </h2>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.reassureBody)}
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
    s.reassureTitle,
    s.reassureBody,
    "",
    `${s.cta}: ${accountOrderUrl(order)}`,
    "",
    s.signoff,
  ].join("\n");

  return { subject, html, text };
}

export async function sendReturnCancelledEmail(
  orderId: string,
  rma: RmaCancelledContext,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  const { subject, html, text } = buildReturnCancelledEmail(order, rma);

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] return-cancelled email not sent (no RESEND_API_KEY) for ${order.publicNumber} / ${rma.returnReference}`,
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
        { name: "type", value: "return_cancelled" },
        { name: "order", value: order.publicNumber },
        { name: "return", value: rma.returnReference },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for return-cancelled ${order.publicNumber} / ${rma.returnReference}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
