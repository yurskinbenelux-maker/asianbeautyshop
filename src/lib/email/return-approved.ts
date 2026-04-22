// ─────────────────────────────────────────────────────────────────────────
// Return approved email — sent once Sofia reviews a return request and is
// ready for the parcel to ship back.  This is the one that carries the
// prepaid label (if any), the return address, and the 14-day "please ship
// within" window required by EU law.
//
// The template handles three shipping modes:
//   · prepaidLabel   — we're sending them a downloadable label
//   · selfPostage    — they ship at their expense (e.g., cross-border)
//   · damagedReplace — damaged/defective goods, we pay return shipping
//
// Driven by `mode` on RmaApprovalContext.
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

export type RmaShipMode = "prepaidLabel" | "selfPostage" | "damagedReplace";

export type RmaApprovalContext = {
  returnReference: string;
  items: Array<{ productName: string; quantity: number }>;
  mode: RmaShipMode;
  /** Prefer a download URL rendered as a CTA. Only used when mode = prepaidLabel. */
  prepaidLabelUrl?: string | null;
  /**
   * Override the return address if we ever move the warehouse. Defaults
   * to the K'Elmus BV address used in the legal returns page.
   */
  returnAddressHtml?: string;
};

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (ref: string) => string;
  preheader: (mode: RmaShipMode) => string;
  heading: (firstName: string | null, mode: RmaShipMode) => string;
  lede: (mode: RmaShipMode) => string;
  itemsLabel: string;
  addressLabel: string;
  howToShipTitle: string;
  howToShipBody: (mode: RmaShipMode) => string;
  windowTitle: string;
  windowBody: string;
  refundTitle: string;
  refundBody: string;
  ctaLabel: string;
  ctaAccount: string;
  signoff: string;
  footer: string;
};

const DEFAULT_ADDRESS_HTML = /* html */ `
  K'Elmus Group BV — Returns<br>
  Boomsesteenweg 41/4b<br>
  2630 Aartselaar<br>
  Belgium
`.trim();

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (r) => `Your return is approved — ${r}`,
    preheader: (m) =>
      m === "prepaidLabel"
        ? "Your prepaid return label is ready."
        : m === "damagedReplace"
          ? "We've got this — no cost to you."
          : "Here's the return address and next steps.",
    heading: (f, m) => {
      const who = f ? `${f}, ` : "";
      return m === "damagedReplace"
        ? `${who}we're sorry — and we've got this.`
        : `${who}your return is approved.`;
    },
    lede: (m) =>
      m === "prepaidLabel"
        ? "Download the prepaid label below, attach it to your parcel, and drop it off at any post office or carrier pick-up point."
        : m === "damagedReplace"
          ? "Thank you for letting us know. We're covering the return shipping — once we receive the damaged item we'll send a replacement or issue a full refund, whichever you preferred."
          : "You're ready to ship. Pack the products (in their original box if possible) and send them to the address below. Return postage is at your expense unless we agreed otherwise.",
    itemsLabel: "Items in this return",
    addressLabel: "Return address",
    howToShipTitle: "How to ship",
    howToShipBody: (m) =>
      m === "prepaidLabel"
        ? "Print the label at full size, tape it securely over any existing shipping label, and hand the parcel in at your nearest post office or pickup point. Keep the receipt until your refund lands."
        : m === "damagedReplace"
          ? "Use the prepaid label we've included below. If the damage makes the item unsafe to ship (for example a leaking bottle), reply to this email with a photo and we'll refund without asking for the parcel back."
          : "Use any carrier you prefer. We recommend a tracked service so you can confirm the parcel reaches us. Keep the tracking number — reply to this email with it and we'll watch for the delivery.",
    windowTitle: "Please ship within 14 days",
    windowBody:
      "Under EU consumer law the parcel must be posted within 14 days of your return notification. We'll start the refund within 14 days of receiving it.",
    refundTitle: "About your refund",
    refundBody:
      "We refund to the original payment method once the parcel is received and inspected. You'll get a confirmation email the moment the refund is issued.",
    ctaLabel: "Download return label",
    ctaAccount: "View my order",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussels, Belgium",
  },
  NL: {
    subject: (r) => `Je retour is goedgekeurd — ${r}`,
    preheader: (m) =>
      m === "prepaidLabel"
        ? "Je voorgefrankeerde retourlabel staat klaar."
        : m === "damagedReplace"
          ? "Wij regelen het — zonder kosten voor jou."
          : "Hier zijn het retouradres en de volgende stappen.",
    heading: (f, m) => {
      const who = f ? `${f}, ` : "";
      return m === "damagedReplace"
        ? `${who}excuses — we regelen het.`
        : `${who}je retour is goedgekeurd.`;
    },
    lede: (m) =>
      m === "prepaidLabel"
        ? "Download het voorgefrankeerde label hieronder, plak het op je pakket en lever het af bij een postkantoor of afhaalpunt."
        : m === "damagedReplace"
          ? "Bedankt voor je bericht. We nemen de retourkosten voor onze rekening — zodra we het beschadigde artikel ontvangen, sturen we een vervanging of betalen we het volledige bedrag terug, afhankelijk van je voorkeur."
          : "Je kunt nu verzenden. Verpak de producten (indien mogelijk in de oorspronkelijke doos) en stuur ze naar het adres hieronder. De retourkosten zijn voor jouw rekening tenzij anders afgesproken.",
    itemsLabel: "Artikelen in deze retour",
    addressLabel: "Retouradres",
    howToShipTitle: "Hoe verzenden",
    howToShipBody: (m) =>
      m === "prepaidLabel"
        ? "Druk het label af op ware grootte, plak het stevig over een eventueel bestaand verzendlabel en geef het pakket af bij je dichtstbijzijnde postkantoor of afhaalpunt. Bewaar het verzendbewijs tot je terugbetaling is aangekomen."
        : m === "damagedReplace"
          ? "Gebruik het voorgefrankeerde label hieronder. Als de schade het artikel onveilig maakt om te verzenden (zoals een lekkende fles), antwoord dan op deze mail met een foto — we betalen terug zonder dat je het pakket hoeft te versturen."
          : "Gebruik de vervoerder die je verkiest. We raden een met-track-en-trace-service aan zodat je kan bevestigen dat het pakket bij ons aankomt. Bewaar het trackingnummer en stuur het ons door — we volgen de levering mee.",
    windowTitle: "Verzenden binnen 14 dagen",
    windowBody:
      "Volgens Europees consumentenrecht moet het pakket binnen 14 dagen na je retourmelding zijn verzonden. We starten de terugbetaling binnen 14 dagen na ontvangst.",
    refundTitle: "Over je terugbetaling",
    refundBody:
      "We betalen terug via de oorspronkelijke betaalmethode zodra het pakket is ontvangen en gecontroleerd. Je krijgt een bevestigingsmail zodra de terugbetaling is uitgevoerd.",
    ctaLabel: "Retourlabel downloaden",
    ctaAccount: "Bestelling bekijken",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Brussel, België",
  },
  FR: {
    subject: (r) => `Votre retour est approuvé — ${r}`,
    preheader: (m) =>
      m === "prepaidLabel"
        ? "Votre étiquette de retour prépayée est prête."
        : m === "damagedReplace"
          ? "On s'en occupe — sans frais pour vous."
          : "Voici l'adresse de retour et les étapes suivantes.",
    heading: (f, m) => {
      const who = f ? `${f}, ` : "";
      return m === "damagedReplace"
        ? `${who}nous sommes désolés — on s'en occupe.`
        : `${who}votre retour est approuvé.`;
    },
    lede: (m) =>
      m === "prepaidLabel"
        ? "Téléchargez l'étiquette prépayée ci-dessous, collez-la sur votre colis et déposez-le dans n'importe quel bureau de poste ou point relais."
        : m === "damagedReplace"
          ? "Merci pour votre message. Nous prenons en charge les frais de retour — dès réception de l'article endommagé, nous enverrons un remplacement ou procéderons à un remboursement intégral, selon votre préférence."
          : "Vous pouvez expédier. Emballez les produits (dans leur carton d'origine si possible) et envoyez-les à l'adresse ci-dessous. Les frais de retour restent à votre charge sauf accord contraire.",
    itemsLabel: "Articles de ce retour",
    addressLabel: "Adresse de retour",
    howToShipTitle: "Comment expédier",
    howToShipBody: (m) =>
      m === "prepaidLabel"
        ? "Imprimez l'étiquette en taille réelle, collez-la solidement par-dessus toute étiquette existante, et déposez le colis au bureau de poste ou point relais le plus proche. Conservez le reçu jusqu'à réception de votre remboursement."
        : m === "damagedReplace"
          ? "Utilisez l'étiquette prépayée ci-dessous. Si les dégâts rendent l'article dangereux à expédier (par exemple un flacon qui fuit), répondez à cet e-mail avec une photo — nous rembourserons sans retour du colis."
          : "Choisissez le transporteur qui vous convient. Nous recommandons un service avec suivi pour confirmer la réception. Conservez le numéro de suivi et envoyez-le-nous — nous suivrons la livraison.",
    windowTitle: "À expédier sous 14 jours",
    windowBody:
      "Conformément au droit européen de la consommation, le colis doit être posté dans les 14 jours suivant votre notification de retour. Nous lancerons le remboursement dans les 14 jours suivant sa réception.",
    refundTitle: "À propos de votre remboursement",
    refundBody:
      "Nous remboursons sur le moyen de paiement initial dès que le colis est reçu et contrôlé. Vous recevrez un e-mail de confirmation au moment où le remboursement est émis.",
    ctaLabel: "Télécharger l'étiquette",
    ctaAccount: "Voir ma commande",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Bruxelles, Belgique",
  },
  RU: {
    subject: (r) => `Ваш возврат одобрен — ${r}`,
    preheader: (m) =>
      m === "prepaidLabel"
        ? "Предоплаченная этикетка готова."
        : m === "damagedReplace"
          ? "Мы всё уладим — для вас без расходов."
          : "Адрес возврата и дальнейшие шаги.",
    heading: (f, m) => {
      const who = f ? `${f}, ` : "";
      return m === "damagedReplace"
        ? `${who}нам жаль — и мы всё уладим.`
        : `${who}ваш возврат одобрен.`;
    },
    lede: (m) =>
      m === "prepaidLabel"
        ? "Скачайте предоплаченную этикетку ниже, прикрепите её к посылке и сдайте в любое отделение почты или пункт выдачи."
        : m === "damagedReplace"
          ? "Спасибо, что сообщили. Мы берём на себя стоимость обратной доставки — как только получим повреждённый товар, отправим замену или вернём полную стоимость, на ваш выбор."
          : "Можно отправлять. Упакуйте товары (по возможности в оригинальную коробку) и отправьте по адресу ниже. Стоимость обратной доставки оплачивается вами, если мы не договорились иначе.",
    itemsLabel: "Товары в этом возврате",
    addressLabel: "Адрес возврата",
    howToShipTitle: "Как отправить",
    howToShipBody: (m) =>
      m === "prepaidLabel"
        ? "Напечатайте этикетку в полном размере, наклейте поверх любой существующей, сдайте посылку в ближайшее отделение почты или пункт выдачи. Сохраните квитанцию до поступления возврата."
        : m === "damagedReplace"
          ? "Используйте предоплаченную этикетку ниже. Если повреждение делает товар небезопасным для отправки (например, протекающий флакон), ответьте на это письмо с фото — мы вернём деньги без отправки посылки."
          : "Выберите удобного перевозчика. Рекомендуем сервис с отслеживанием, чтобы подтвердить доставку. Сохраните номер отслеживания и пришлите нам — мы проследим за посылкой.",
    windowTitle: "Отправьте в течение 14 дней",
    windowBody:
      "По европейскому законодательству посылку нужно отправить в течение 14 дней после уведомления о возврате. Мы запустим возврат средств в течение 14 дней после получения.",
    refundTitle: "О возврате средств",
    refundBody:
      "Мы вернём деньги на исходный способ оплаты после получения и проверки посылки. Вы получите подтверждающее письмо в момент оформления возврата.",
    ctaLabel: "Скачать этикетку",
    ctaAccount: "Посмотреть заказ",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Брюссель, Бельгия",
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type ReturnApprovedEmail = {
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

function renderItemsTable(items: RmaApprovalContext["items"]): string {
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

export function buildReturnApprovedEmail(
  order: EmailOrder,
  rma: RmaApprovalContext,
): ReturnApprovedEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(rma.returnReference);

  // The CTA on the card is EITHER the prepaid label (if any) OR the
  // account order page. In damagedReplace mode we also prefer the label
  // CTA if we included one, otherwise fall back to account.
  const hasLabel =
    (rma.mode === "prepaidLabel" || rma.mode === "damagedReplace") &&
    typeof rma.prepaidLabelUrl === "string" &&
    rma.prepaidLabelUrl.length > 0;

  const primaryCtaHref = hasLabel ? rma.prepaidLabelUrl! : accountOrderUrl(order);
  const primaryCtaLabel = hasLabel ? s.ctaLabel : s.ctaAccount;

  const addressBlock =
    rma.mode === "selfPostage"
      ? /* html */ `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
          ${esc(s.addressLabel)}
        </div>
        <div style="margin:8px 0 24px 0;padding:14px 16px;background:#F3EDE3;border:1px solid rgba(26,26,26,0.08);font-size:14px;line-height:1.65;color:#1A1A1A;">
          ${rma.returnAddressHtml ?? DEFAULT_ADDRESS_HTML}
        </div>
      `
      : "";

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName, rma.mode))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede(rma.mode))}
    </p>

    <p style="margin:0 0 20px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(order.publicNumber)} · ${esc(rma.returnReference)}
    </p>

    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
      ${esc(s.itemsLabel)}
    </div>
    ${renderItemsTable(rma.items)}

    ${addressBlock}

    ${renderCtaButton(primaryCtaHref, primaryCtaLabel)}

    <h2 style="margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.howToShipTitle)}
    </h2>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.howToShipBody(rma.mode))}
    </p>

    <h2 style="margin:20px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.windowTitle)}
    </h2>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.windowBody)}
    </p>

    <h2 style="margin:20px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:18px;line-height:1.3;color:#1A1A1A;">
      ${esc(s.refundTitle)}
    </h2>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#5E5751;">
      ${esc(s.refundBody)}
    </p>

    ${EMAIL_HR}

    <p style="margin:0;font-size:14px;line-height:1.65;color:#1A1A1A;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: s.preheader(rma.mode),
    lang: order.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });

  const text = [
    s.heading(order.customerFirstName, rma.mode),
    "",
    s.lede(rma.mode),
    "",
    `${order.publicNumber} · ${rma.returnReference}`,
    "",
    `${s.itemsLabel}:`,
    ...rma.items.map((it) => `  ${it.productName} × ${it.quantity}`),
    "",
    ...(rma.mode === "selfPostage"
      ? [
          `${s.addressLabel}:`,
          "  K'Elmus Group BV — Returns",
          "  Boomsesteenweg 41/4b",
          "  2630 Aartselaar",
          "  Belgium",
          "",
        ]
      : []),
    hasLabel ? `${s.ctaLabel}: ${rma.prepaidLabelUrl}` : `${s.ctaAccount}: ${accountOrderUrl(order)}`,
    "",
    s.howToShipTitle,
    s.howToShipBody(rma.mode),
    "",
    s.windowTitle,
    s.windowBody,
    "",
    s.refundTitle,
    s.refundBody,
    "",
    s.signoff,
  ].join("\n");

  return { subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendReturnApprovedEmail(
  orderId: string,
  rma: RmaApprovalContext,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  const { subject, html, text } = buildReturnApprovedEmail(order, rma);

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] return-approved email not sent (no RESEND_API_KEY) for ${order.publicNumber} / ${rma.returnReference}`,
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
        { name: "type", value: "return_approved" },
        { name: "mode", value: rma.mode },
        { name: "order", value: order.publicNumber },
        { name: "return", value: rma.returnReference },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for return-approved ${order.publicNumber} / ${rma.returnReference}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
