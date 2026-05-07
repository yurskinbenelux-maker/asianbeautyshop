// ─────────────────────────────────────────────────────────────────────────
// Abandoned-cart reminder email — "you left something in your bag."
//
// One email per cart, sent by the daily cron after the cart has sat
// untouched for a while (4h–72h window by default). Soft tone, not
// pushy — no urgency timers, no fake scarcity. Just a reminder with a
// friendly "pick up where you left off" link.
//
// Localised EN / NL / FR / RU. From donotreply@, Reply-To hello@ so if
// the customer replies with questions Sofia sees them.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  getResend,
  fromTransactional,
  replyToAddress,
} from "./resend";
import { EMAIL_HR, esc, renderCtaButton, renderEmailShell } from "./html";
import {
  applyOverrides,
  getEmailOverrides,
  type EmailOverrides,
} from "./copy-overrides";
import type { AbandonedCart } from "@/lib/queries/abandoned-carts";

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: string;
  preheader: string;
  heading: (firstName: string | null) => string;
  lede: string;
  cta: string;
  signoff: string;
  footer: string;
  andMore: (n: number) => string;
};

export const ABANDONED_CART_STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "You left something in your bag — YU.R Skin Solution",
    preheader: "Pick up where you left off.",
    heading: (f) =>
      f ? `${f}, your skincare routine is waiting.` : "Your skincare routine is waiting.",
    lede:
      "We saved the pieces you were looking at. Whenever you're ready, pick up where you left off — everything is still there.",
    cta: "Return to my bag",
    signoff: "With care,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
    andMore: (n) => `and ${n} more`,
  },
  NL: {
    subject: "Je hebt iets achtergelaten in je tas — YU.R Skin Solution",
    preheader: "Ga verder waar je was gebleven.",
    heading: (f) =>
      f ? `${f}, je huidverzorgingsroutine wacht op je.` : "Je huidverzorgingsroutine wacht op je.",
    lede:
      "We hebben de producten waar je naar keek voor je bewaard. Wanneer je er klaar voor bent, ga je verder waar je was gebleven — alles staat nog klaar.",
    cta: "Terug naar mijn tas",
    signoff: "Met zorg,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
    andMore: (n) => `en ${n} meer`,
  },
  FR: {
    subject: "Vous avez laissé quelque chose dans votre panier — YU.R Skin Solution",
    preheader: "Reprenez là où vous en étiez.",
    heading: (f) =>
      f ? `${f}, votre routine de soin vous attend.` : "Votre routine de soin vous attend.",
    lede:
      "Nous avons gardé les produits que vous regardiez. Quand vous êtes prêt·e, reprenez là où vous en étiez — tout est encore là.",
    cta: "Retour à mon panier",
    signoff: "Avec attention,\nSofia · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
    andMore: (n) => `et ${n} autre(s)`,
  },
  RU: {
    subject: "В вашей корзине остались товары — YU.R Skin Solution",
    preheader: "Вернитесь к тому, что выбирали.",
    heading: (f) =>
      f ? `${f}, ваш рутина ждёт.` : "Ваш рутина ждёт.",
    lede:
      "Мы сохранили то, что вы смотрели. Когда будет удобно, вернитесь и продолжите — всё на месте.",
    cta: "Вернуться в корзину",
    signoff: "С заботой,\nСофия · YU.R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
    andMore: (n) => `и ещё ${n}`,
  },
};

// ────────── builder ─────────────────────────────────────────────────────

export type AbandonedCartEmail = {
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

function cartUrl(cart: AbandonedCart): string {
  const locale = cart.locale.toLowerCase();
  return `${siteUrl()}/${locale}/cart`;
}

export function buildAbandonedCartEmail(
  cart: AbandonedCart,
  options?: { overrides?: EmailOverrides },
): AbandonedCartEmail {
  const s = applyOverrides(
    ABANDONED_CART_STRINGS[cart.locale] ?? ABANDONED_CART_STRINGS.EN,
    options?.overrides,
  );

  // Small item roster. Show up to 3, then "and N more".
  const itemsHtml = cart.items
    .map(
      (it) => /* html */ `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(26,26,26,0.06);vertical-align:middle;">
          ${
            it.imageUrl
              ? `<img src="${esc(it.imageUrl)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:cover;background:#F3EDE3;" />`
              : `<div style="width:56px;height:56px;background:#F3EDE3;"></div>`
          }
        </td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid rgba(26,26,26,0.06);width:100%;">
          <div style="font-size:14px;line-height:1.4;color:#1A1A1A;">
            ${esc(it.productName)}
          </div>
          <div style="margin-top:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:#8A8A8A;">
            × ${it.quantity}
          </div>
        </td>
      </tr>`,
    )
    .join("");

  const extra = cart.itemCount - cart.items.length;
  const overflowRow =
    extra > 0
      ? /* html */ `
      <tr>
        <td colspan="2" style="padding:10px 0 0 0;font-size:12px;font-style:italic;color:#8A8A8A;">
          ${esc(s.andMore(extra))}
        </td>
      </tr>`
      : "";

  const body = /* html */ `
    <h1 style="margin:28px 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;line-height:1.25;color:#1A1A1A;">
      ${esc(s.heading(cart.firstName))}
    </h1>

    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#1A1A1A;">
      ${esc(s.lede)}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;border-top:1px solid rgba(26,26,26,0.06);">
      ${itemsHtml}
      ${overflowRow}
    </table>

    ${renderCtaButton(cartUrl(cart), s.cta)}

    ${EMAIL_HR}

    <p style="margin:0;font-size:14px;line-height:1.65;color:#1A1A1A;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const html = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: cart.locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });

  const text = [
    s.heading(cart.firstName),
    "",
    s.lede,
    "",
    ...cart.items.map((it) => `• ${it.productName} × ${it.quantity}`),
    extra > 0 ? `• ${s.andMore(extra)}` : null,
    "",
    `${s.cta}: ${cartUrl(cart)}`,
    "",
    s.signoff,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject: s.subject, html, text };
}

// ────────── sender ──────────────────────────────────────────────────────

export async function sendAbandonedCartEmail(
  cart: AbandonedCart,
): Promise<{ sent: boolean; reason?: string }> {
  const overrides = await getEmailOverrides("abandoned-cart", cart.locale);
  const { subject, html, text } = buildAbandonedCartEmail(cart, { overrides });

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] abandoned-cart email not sent (no RESEND_API_KEY) for cart ${cart.cartId}`,
    );
    return { sent: false, reason: "resend-not-configured" };
  }

  try {
    await client.emails.send({
      from: fromTransactional(),
      to: cart.email,
      subject,
      html,
      text,
      replyTo: replyToAddress(),
      tags: [
        { name: "type", value: "abandoned_cart" },
        { name: "cart", value: cart.cartId },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for abandoned-cart ${cart.cartId}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
