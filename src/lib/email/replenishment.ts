// ─────────────────────────────────────────────────────────────────────────
// Replenishment-reminder email — sent 45-90 days after delivery to a
// customer who hasn't reordered. Soft-tone "running low?" with a 1-click
// link back to the original order detail page (where the Reorder button
// puts everything back in the cart, see #178).
//
// Localised EN / NL / FR / RU. From donotreply@, Reply-To hello@.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import { getOrderForEmail, type EmailOrder } from "./order-query";

type Strings = {
  subject: (orderNo: string) => string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  itemsLabel: string;
  cta: string;
  signoff: string;
  footer: string;
  hint: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (n) => `Time to top up? — ${n}`,
    preheader: "Your last order is around the time most people run low.",
    heading: (f) => (f ? `${f}, time to top up?` : "Time to top up?"),
    lede: "It's been about six weeks since we sent your last order. If you've been using your products as part of a daily skincare routine, this is around the time most people start scraping the bottom of the bottle.",
    itemsLabel: "What was in that order",
    cta: "Reorder in one click",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
    hint: "If you topped up elsewhere or you're still going strong, please ignore this — we won't pester you again about this order.",
  },
  NL: {
    subject: (n) => `Tijd om bij te vullen? — ${n}`,
    preheader: "Je vorige bestelling is rond de tijd dat de meeste mensen op raken.",
    heading: (f) => (f ? `${f}, tijd om bij te vullen?` : "Tijd om bij te vullen?"),
    lede: "Het is ongeveer zes weken geleden sinds we je vorige bestelling hebben verstuurd. Als je je producten dagelijks gebruikt, raken de meesten rond deze tijd op.",
    itemsLabel: "Wat zat er in die bestelling",
    cta: "Opnieuw bestellen in één klik",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
    hint: "Heb je elders bijgevuld of heb je nog voldoende? Negeer dit gerust — we sturen geen tweede herinnering voor deze bestelling.",
  },
  FR: {
    subject: (n) => `Le moment de refaire le plein ? — ${n}`,
    preheader: "Votre commande précédente date du moment où l'on tombe à court.",
    heading: (f) => (f ? `${f}, c'est le moment de refaire le plein ?` : "Le moment de refaire le plein ?"),
    lede: "Cela fait environ six semaines que nous avons expédié votre commande. Si vous avez utilisé vos produits quotidiennement, c'est l'époque où la plupart des gens approchent du fond du flacon.",
    itemsLabel: "Ce que contenait cette commande",
    cta: "Recommander en un clic",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
    hint: "Si vous vous êtes déjà ravitaillé ailleurs ou si vous avez encore tout, ignorez ce message — nous n'insisterons pas pour cette commande.",
  },
  RU: {
    subject: (n) => `Пора пополнить запас? — ${n}`,
    preheader: "Время, когда у большинства уже подходят к концу.",
    heading: (f) => (f ? `${f}, пора пополнить запас?` : "Пора пополнить запас?"),
    lede: "Прошло около шести недель с момента отправки заказа. Если вы используете средства как часть ежедневного рутины, обычно к этому моменту флаконы подходят к концу.",
    itemsLabel: "Что было в том заказе",
    cta: "Заказать снова в один клик",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
    hint: "Если уже пополнили или ещё хватает — просто проигнорируйте это письмо. Мы не будем напоминать повторно об этом заказе.",
  },
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://yurskinsolution.eu"
  );
}

function reorderUrl(order: EmailOrder): string {
  const locale = order.locale.toLowerCase();
  return `${siteUrl()}/${locale}/account/orders/${encodeURIComponent(order.publicNumber)}`;
}

export type ReplenishmentEmail = {
  subject: string;
  html: string;
  text: string;
};

export function buildReplenishmentEmail(order: EmailOrder): ReplenishmentEmail {
  const s = STRINGS[order.locale] ?? STRINGS.EN;
  const subject = s.subject(order.publicNumber);

  // Show up to 3 items by name — keeps the email short and readable.
  // Customers with bigger orders see "and N more".
  const MAX = 3;
  const visible = order.items.slice(0, MAX);
  const extra = order.items.length - visible.length;

  const itemsHtml = visible
    .map(
      (it) => /* html */ `
      <li style="margin:4px 0;font-size:14px;color:#1A1A1A;">
        ${esc(it.productName)}${
          it.quantity > 1
            ? `<span style="margin-left:6px;color:#8A8A8A;">× ${it.quantity}</span>`
            : ""
        }
      </li>`,
    )
    .join("");

  const overflow =
    extra > 0
      ? `<li style="margin:4px 0;font-size:13px;color:#8A8A8A;font-style:italic;">…and ${extra} more</li>`
      : "";

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(order.customerFirstName))}
    </h1>

    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede)}
    </p>

    <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6F6A65;">
      ${esc(s.itemsLabel)}
    </p>
    <ul style="margin:0 0 24px 0;padding-left:18px;">
      ${itemsHtml}
      ${overflow}
    </ul>

    ${renderCtaButton(reorderUrl(order), s.cta)}

    ${EMAIL_HR}

    <p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;">
      ${esc(s.hint)}
    </p>
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
    s.itemsLabel,
    ...visible.map((it) => `• ${it.productName}${it.quantity > 1 ? ` × ${it.quantity}` : ""}`),
    extra > 0 ? `• …and ${extra} more` : null,
    "",
    `${s.cta}: ${reorderUrl(order)}`,
    "",
    s.hint,
    "",
    s.signoff,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}

export async function sendReplenishmentEmail(
  orderId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  const { subject, html, text } = buildReplenishmentEmail(order);

  const client = getResend();
  if (!client) return { sent: false, reason: "resend-not-configured" };

  try {
    await client.emails.send({
      from: fromTransactional(),
      to: order.email,
      subject,
      html,
      text,
      replyTo: replyToAddress(),
      tags: [
        { name: "type", value: "replenishment" },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] replenishment send failed for ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "send-failed" };
  }
}
