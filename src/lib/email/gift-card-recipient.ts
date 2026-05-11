// ─────────────────────────────────────────────────────────────────────────
// Gift card RECIPIENT email — sent on the PAID transition by the Mollie
// webhook. Goes to:
//   · the buyer themselves when deliveryMode === "self"
//   · the friend the buyer named when deliveryMode === "friend"
//
// The body changes subtly between the two — for "self" we drop the "from
// X" line. Localised EN / NL / FR / RU.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { fromTransactional, getResend, replyToAddress } from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";
import type { GiftCardDeliveryMode } from "@/lib/gift-cards/types";

type Strings = {
  subjectFriend: (sender: string | null) => string;
  subjectSelf: string;
  preheader: string;
  /** "Hello {name}" or "Hello" if no name. */
  greet: (name: string | null) => string;
  introFriend: (sender: string | null, amount: string) => string;
  introSelf: (amount: string) => string;
  /** Used when the buyer wrote a personal message. */
  noteLabel: string;
  codeLabel: string;
  codeNote: (amount: string, until: string) => string;
  cta: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subjectFriend: (s) =>
      s
        ? `${s} sent you a Asian Beauty Shop gift card`
        : "You've received a Asian Beauty Shop gift card",
    subjectSelf: "Your Asian Beauty Shop gift card is ready",
    preheader: "A small balance for a slow Korean skincare routine.",
    greet: (n) => (n ? `Hello ${n},` : "Hello,"),
    introFriend: (s, amount) =>
      s
        ? `${s} thought of you and sent you a ${amount} Asian Beauty Shop gift card.`
        : `Someone thought of you and sent you a ${amount} Asian Beauty Shop gift card.`,
    introSelf: (amount) =>
      `Your ${amount} Asian Beauty Shop gift card is ready. Use it whenever the moment feels right.`,
    noteLabel: "A note from your sender",
    codeLabel: "Your gift card code",
    codeNote: (amount, until) =>
      `Balance ${amount}. Apply at checkout. Valid until ${until}.`,
    cta: "Browse the collection",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subjectFriend: (s) =>
      s
        ? `${s} heeft je een Asian Beauty Shop cadeaubon gestuurd`
        : "Je hebt een Asian Beauty Shop cadeaubon ontvangen",
    subjectSelf: "Je Asian Beauty Shop cadeaubon is klaar",
    preheader: "Een klein saldo voor een langzaam Koreaans huidverzorgingsroutine.",
    greet: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    introFriend: (s, amount) =>
      s
        ? `${s} heeft aan je gedacht en stuurt je een Asian Beauty Shop cadeaubon van ${amount}.`
        : `Iemand heeft aan je gedacht en stuurt je een Asian Beauty Shop cadeaubon van ${amount}.`,
    introSelf: (amount) =>
      `Je Asian Beauty Shop cadeaubon van ${amount} staat klaar. Gebruik wanneer het goed voelt.`,
    noteLabel: "Een bericht van je verzender",
    codeLabel: "Je cadeaubon-code",
    codeNote: (amount, until) =>
      `Saldo ${amount}. In te wisselen aan de kassa. Geldig tot ${until}.`,
    cta: "Bekijk de collectie",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subjectFriend: (s) =>
      s
        ? `${s} vous a envoyé une carte cadeau Asian Beauty Shop`
        : "Vous avez reçu une carte cadeau Asian Beauty Shop",
    subjectSelf: "Votre carte cadeau Asian Beauty Shop est prête",
    preheader: "Un solde discret pour un routine de soin coréen lent.",
    greet: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    introFriend: (s, amount) =>
      s
        ? `${s} a pensé à vous et vous offre une carte cadeau Asian Beauty Shop de ${amount}.`
        : `Quelqu'un a pensé à vous et vous offre une carte cadeau Asian Beauty Shop de ${amount}.`,
    introSelf: (amount) =>
      `Votre carte cadeau Asian Beauty Shop de ${amount} est prête. À utiliser quand vous le souhaitez.`,
    noteLabel: "Un mot de votre expéditeur",
    codeLabel: "Votre code carte cadeau",
    codeNote: (amount, until) =>
      `Solde ${amount}. À utiliser en caisse. Valable jusqu'au ${until}.`,
    cta: "Découvrir la collection",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subjectFriend: (s) =>
      s
        ? `${s} прислал(а) вам подарочную карту Asian Beauty Shop`
        : "Вы получили подарочную карту Asian Beauty Shop",
    subjectSelf: "Ваша подарочная карта Asian Beauty Shop готова",
    preheader: "Небольшой баланс для медленного корейского рутины.",
    greet: (n) => (n ? `Здравствуйте, ${n},` : "Здравствуйте,"),
    introFriend: (s, amount) =>
      s
        ? `${s} подумал(а) о вас и прислал(а) подарочную карту Asian Beauty Shop на ${amount}.`
        : `Кто-то подумал о вас и прислал подарочную карту Asian Beauty Shop на ${amount}.`,
    introSelf: (amount) =>
      `Ваша подарочная карта Asian Beauty Shop на ${amount} готова. Применяйте, когда удобно.`,
    noteLabel: "Сообщение от отправителя",
    codeLabel: "Код подарочной карты",
    codeNote: (amount, until) =>
      `Баланс ${amount}. Применяется при оформлении заказа. Действует до ${until}.`,
    cta: "К коллекции",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

export type GiftCardRecipientPayload = {
  locale: Locale;
  to: string;
  recipientName?: string | null;
  senderName?: string | null;
  buyerEmail: string;
  message?: string | null;
  code: string;
  amountEur: number;
  deliveryMode: GiftCardDeliveryMode;
  /** Override the default 365-day expiry for display purposes. */
  expiresAt?: Date;
};

export async function sendGiftCardRecipientEmail(
  payload: GiftCardRecipientPayload,
): Promise<{ sent: boolean }> {
  const resend = getResend();
  if (!resend) return { sent: false };

  const s = STRINGS[payload.locale];
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const shopUrl = `${siteOrigin}/${payload.locale.toLowerCase()}/shop`;

  // Format the EUR amount in a locale-friendly way.
  const amountStr = formatEurForLocale(payload.amountEur, payload.locale);
  const expiresAt =
    payload.expiresAt ??
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const untilStr = expiresAt.toLocaleDateString(
    payload.locale.toLowerCase(),
    { day: "numeric", month: "long", year: "numeric" },
  );

  const isFriendMode = payload.deliveryMode === "friend";
  const subject = isFriendMode
    ? s.subjectFriend(payload.senderName ?? null)
    : s.subjectSelf;
  const intro = isFriendMode
    ? s.introFriend(payload.senderName ?? null, amountStr)
    : s.introSelf(amountStr);

  const messageBlock =
    isFriendMode && payload.message && payload.message.trim().length > 0
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;border-left:2px solid #C2B7A6;background:#FBF7EF;">
          <tr>
            <td style="padding:14px 18px;">
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
                ${esc(s.noteLabel)}
              </p>
              <p style="margin:0;font-size:14px;line-height:1.7;color:#3D3935;font-style:italic;white-space:pre-line;">
                ${esc(payload.message)}
              </p>
            </td>
          </tr>
        </table>
      `
      : "";

  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.greet(payload.recipientName ?? null))}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(intro)}
    </p>
    ${messageBlock}
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
      ${esc(s.codeNote(amountStr, untilStr))}
    </p>
    ${renderCtaButton(shopUrl, s.cta)}
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
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
      subject,
      html,
      tags: [
        { name: "type", value: "gift_card_recipient" },
        { name: "code", value: payload.code },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/gift-card-recipient] send failed", err);
    return { sent: false };
  }
}

function formatEurForLocale(eur: number, locale: Locale): string {
  // The Locale enum values match Intl tags after lowercase. Use a sensible
  // BCP-47 fallback per locale so currency formatting doesn't look off.
  const tagByLocale: Record<Locale, string> = {
    EN: "en-IE",
    NL: "nl-BE",
    FR: "fr-BE",
    RU: "ru-RU",
  };
  return new Intl.NumberFormat(tagByLocale[locale], {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(eur);
}
