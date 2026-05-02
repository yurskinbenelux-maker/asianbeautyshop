// ─────────────────────────────────────────────────────────────────────────
// Gift-card BUYER CONFIRMATION email — only sent when the card was sent
// to a friend (deliveryMode === "friend"). Confirms the purchase and tells
// the buyer where the code went, and includes a copy of the code so they
// can re-share if the friend's email bounces.
//
// We deliberately don't send this for "self" mode: the recipient email
// already covers the buyer in that case.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { fromTransactional, getResend, replyToAddress } from "./resend";
import { esc, renderEmailShell } from "./html";

type Strings = {
  subject: string;
  preheader: string;
  heading: string;
  lede: (recipient: string, amount: string) => string;
  codeLabel: string;
  codeNote: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Your YU•R gift card has been sent",
    preheader: "We've delivered the code on your behalf.",
    heading: "Your gift is on its way.",
    lede: (recipient, amount) =>
      `We've sent the ${amount} gift card to ${recipient}. They'll receive it in their inbox right now.`,
    codeLabel: "A copy for your records",
    codeNote:
      "Keep this code in case the recipient needs you to forward it again.",
    signoff: "Thank you,\nSofia · YU•R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Je YU•R cadeaubon is verzonden",
    preheader: "We hebben de code namens jou bezorgd.",
    heading: "Je cadeau is onderweg.",
    lede: (recipient, amount) =>
      `We hebben de cadeaubon van ${amount} naar ${recipient} verzonden. Ze ontvangen het zo in hun inbox.`,
    codeLabel: "Een kopie voor je administratie",
    codeNote:
      "Bewaar deze code voor het geval je de ontvanger opnieuw moet helpen.",
    signoff: "Dank je,\nSofia · YU•R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Votre carte cadeau YU•R a été envoyée",
    preheader: "Nous avons remis le code en votre nom.",
    heading: "Votre cadeau est en route.",
    lede: (recipient, amount) =>
      `Nous avons envoyé la carte cadeau de ${amount} à ${recipient}. Elle arrive dans sa boîte mail.`,
    codeLabel: "Une copie pour vos archives",
    codeNote:
      "Gardez ce code au cas où vous auriez besoin de le renvoyer au destinataire.",
    signoff: "Merci,\nSofia · YU•R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Подарочная карта YU•R отправлена",
    preheader: "Мы передали код от вашего имени.",
    heading: "Подарок в пути.",
    lede: (recipient, amount) =>
      `Мы отправили подарочную карту на ${amount} получателю ${recipient}. Письмо уже у него во входящих.`,
    codeLabel: "Копия для вашего архива",
    codeNote:
      "Сохраните этот код, если потребуется переслать его повторно.",
    signoff: "Спасибо,\nСофия · YU•R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type GiftCardBuyerConfirmationPayload = {
  locale: Locale;
  to: string;
  recipientEmail: string;
  recipientName?: string | null;
  code: string;
  amountEur: number;
};

export async function sendGiftCardBuyerConfirmationEmail(
  payload: GiftCardBuyerConfirmationPayload,
): Promise<{ sent: boolean }> {
  const resend = getResend();
  if (!resend) return { sent: false };
  const s = STRINGS[payload.locale];

  const tagByLocale: Record<Locale, string> = {
    EN: "en-IE",
    NL: "nl-BE",
    FR: "fr-BE",
    RU: "ru-RU",
  };
  const amountStr = new Intl.NumberFormat(tagByLocale[payload.locale], {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(payload.amountEur);
  const recipientLabel = payload.recipientName
    ? `${payload.recipientName} (${payload.recipientEmail})`
    : payload.recipientEmail;

  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede(recipientLabel, amountStr))}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;border:1px solid rgba(26,26,26,0.12);">
      <tr>
        <td style="padding:22px 16px;text-align:center;">
          <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            ${esc(s.codeLabel)}
          </p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:22px;letter-spacing:0.18em;color:#121110;">
            ${esc(payload.code)}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 28px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;text-align:center;">
      ${esc(s.codeNote)}
    </p>
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: payload.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.to,
      replyTo: replyToAddress(),
      subject: s.subject,
      html,
      tags: [
        { name: "type", value: "gift_card_buyer" },
        { name: "code", value: payload.code },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/gift-card-buyer] send failed", err);
    return { sent: false };
  }
}
