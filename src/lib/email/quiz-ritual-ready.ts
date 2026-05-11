// ─────────────────────────────────────────────────────────────────────────
// Quiz ritual ready email — fires once per quiz completion (per the
// idempotent recordQuizCompletion). Carries the cart-restore magic link
// so the customer can come back any time in the next 60 days and pick
// up exactly the skincare routine they were shown after the quiz.
//
// Localised in EN/NL/FR/RU 2026-05-06 — uses the same `STRINGS:
// Record<Locale, ...>` pattern as the rest of the email layer with
// the standard `STRINGS[locale] ?? STRINGS.EN` fallback. Caller passes
// the customer's preferred locale (resolved from User.preferredLocale
// or, for guests, the URL locale at quiz time).
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { fromTransactional, getResend, replyToAddress } from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";

export type QuizRitualReadyPayload = {
  email: string;
  /** Raw cart-restore token (server hashes it for storage; we send the
   *  raw value in the link). 60-day single-use. */
  cartLinkToken: string;
  /** Recommended products as the customer should see them in the email
   *  itemisation. Names are localised already. */
  items: Array<{ name: string; priceEur: number }>;
  /** YYYY-MM-DD when the link expires. */
  expiresOn: string;
  /** % off the items will receive on the cart-restore page. Always 15
   *  for the current product, but a parameter so future tier changes
   *  don't require touching this template. */
  percentOff: number;
  /** Customer's preferred email language. Falls back to EN if missing
   *  or unrecognised — keeps existing call sites working without churn. */
  locale?: Locale;
};

export type QuizRitualReadySendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

// ────────── per-locale copy ─────────────────────────────────────────────

type Strings = {
  subject: (percent: number) => string;
  preheader: string;
  eyebrow: (percent: number) => string;
  heading: string;
  /** Two-paragraph body — the lede + the offer explanation. The
   *  `percent` placeholder is interpolated by the renderer. */
  lede: (percent: number) => string;
  routineLabel: string;
  subtotalLabel: string;
  rewardLabel: (percent: number) => string;
  /** Italic disclaimer under the receipt. The `expiresOn` date is
   *  formatted by the renderer in locale-appropriate form. */
  disclaimer: (expiresOn: string) => string;
  cta: string;
  /** Two-line sign-off. \n separates the two lines. */
  signoff: string;
  footer: string;
  /** Currency formatter — Intl locale tag for `Intl.NumberFormat`.
   *  e.g. "en-IE" gives "€24.50", "nl-NL" gives "€ 24,50", "fr-FR"
   *  gives "24,50 €". Russian gets RU formatting too. */
  intlLocale: string;
  /** Fallback name used when a product translation is missing — the
   *  caller already substitutes from translations, but this guards
   *  against an EN-only item slipping in. */
  fallbackItemName: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: (p) => `Your Asian Beauty Shop skincare routine is ready · save ${p}%`,
    preheader: "Your skin quiz, packaged. Open it any time in the next 60 days.",
    eyebrow: (p) => `Quiz reward · ${p}% off`,
    heading: "Your skin quiz, packaged.",
    lede: (p) =>
      `Based on your quiz answers, we put a personal skincare routine together for you. Tap the button below any time in the next 60 days and we'll restore this exact cart with ${p}% off the items below.`,
    routineLabel: "Your skincare routine",
    subtotalLabel: "Subtotal",
    rewardLabel: (p) => `Quiz reward (−${p}%)`,
    disclaimer: (d) =>
      `Single-use link, expires ${d}. The discount applies only to the items above — anything you add afterwards stays at full price. Once you place an order with this code, the link goes quiet.`,
    cta: "Open my routine cart",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
    intlLocale: "en-IE",
    fallbackItemName: "Skincare item",
  },
  NL: {
    subject: (p) => `Jouw Asian Beauty Shop huidroutine is klaar · ${p}% korting`,
    preheader: "Je huidquiz, verpakt. Open hem op elk moment de komende 60 dagen.",
    eyebrow: (p) => `Quiz-beloning · ${p}% korting`,
    heading: "Je huidquiz, verpakt.",
    lede: (p) =>
      `Op basis van je antwoorden hebben we een persoonlijke huidroutine voor je samengesteld. Klik op de knop hieronder, op elk moment de komende 60 dagen, en we herstellen deze exacte cart met ${p}% korting op de items hieronder.`,
    routineLabel: "Jouw huidroutine",
    subtotalLabel: "Subtotaal",
    rewardLabel: (p) => `Quiz-beloning (−${p}%)`,
    disclaimer: (d) =>
      `Eenmalige link, verloopt op ${d}. De korting geldt alleen voor de items hierboven — alles wat je daarna toevoegt blijft op volle prijs. Zodra je een bestelling plaatst met deze code, wordt de link gedeactiveerd.`,
    cta: "Open mijn routinecart",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
    intlLocale: "nl-BE",
    fallbackItemName: "Huidverzorgingsproduct",
  },
  FR: {
    subject: (p) => `Votre routine de soin Asian Beauty Shop est prête · ${p}% de remise`,
    preheader:
      "Votre quiz peau, prêt à l'emploi. Ouvrez-le quand vous voulez dans les 60 prochains jours.",
    eyebrow: (p) => `Récompense quiz · ${p}% de remise`,
    heading: "Votre quiz peau, prêt à l'emploi.",
    lede: (p) =>
      `D'après vos réponses, nous avons composé une routine de soin personnelle pour vous. Cliquez sur le bouton ci-dessous, à n'importe quel moment dans les 60 prochains jours, et nous restaurerons ce panier avec ${p}% de remise sur les articles ci-dessous.`,
    routineLabel: "Votre routine de soin",
    subtotalLabel: "Sous-total",
    rewardLabel: (p) => `Récompense quiz (−${p}%)`,
    disclaimer: (d) =>
      `Lien à usage unique, expire le ${d}. La remise s'applique uniquement aux articles ci-dessus — tout ce que vous ajouterez ensuite reste au plein tarif. Une fois la commande passée avec ce code, le lien est désactivé.`,
    cta: "Ouvrir mon panier routine",
    signoff: "Avec soin,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
    intlLocale: "fr-BE",
    fallbackItemName: "Produit de soin",
  },
  RU: {
    subject: (p) => `Ваш уход Asian Beauty Shop готов · скидка ${p}%`,
    preheader:
      "Ваш тест для кожи — собран. Откройте в любой момент в течение 60 дней.",
    eyebrow: (p) => `Награда за тест · скидка ${p}%`,
    heading: "Ваш тест для кожи — собран.",
    lede: (p) =>
      `На основе ваших ответов мы собрали для вас персональный уход. Нажмите на кнопку ниже в любой момент в течение 60 дней, и мы восстановим эту корзину со скидкой ${p}% на средства ниже.`,
    routineLabel: "Ваш уход",
    subtotalLabel: "Подытог",
    rewardLabel: (p) => `Награда за тест (−${p}%)`,
    disclaimer: (d) =>
      `Одноразовая ссылка, действительна до ${d}. Скидка применяется только к средствам выше — всё, что вы добавите позже, останется по полной цене. После оформления заказа с этим кодом ссылка деактивируется.`,
    cta: "Открыть корзину с уходом",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Аартселар, Бельгия",
    intlLocale: "ru-RU",
    fallbackItemName: "Средство по уходу",
  },
};

/** Map a Prisma `Locale` to the URL prefix segment we use on routes
 *  like `/en/quiz/restore?token=...`. */
function localeToUrlPrefix(loc: Locale): string {
  switch (loc) {
    case Locale.NL:
      return "nl";
    case Locale.FR:
      return "fr";
    case Locale.RU:
      return "ru";
    default:
      return "en";
  }
}

export async function sendQuizRitualReadyEmail(
  payload: QuizRitualReadyPayload,
): Promise<QuizRitualReadySendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const locale = payload.locale ?? Locale.EN;
  const s = STRINGS[locale] ?? STRINGS.EN;

  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";
  const restoreUrl = `${siteOrigin}/${localeToUrlPrefix(locale)}/quiz/restore?token=${encodeURIComponent(
    payload.cartLinkToken,
  )}`;
  const html = renderHtml(payload, restoreUrl, locale, s);

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: s.subject(payload.percentOff),
      html,
      tags: [
        { name: "type", value: "quiz_ritual_ready" },
        { name: "percent_off", value: String(payload.percentOff) },
        { name: "locale", value: locale.toLowerCase() },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/quiz-ritual-ready] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}

function renderHtml(
  p: QuizRitualReadyPayload,
  restoreUrl: string,
  locale: Locale,
  s: Strings,
): string {
  const eur = (n: number): string =>
    new Intl.NumberFormat(s.intlLocale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n);

  const subtotal = p.items.reduce((sum, i) => sum + i.priceEur, 0);
  const discounted = subtotal * (1 - p.percentOff / 100);

  const itemsRows = p.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#3D3935;">${esc(
          item.name || s.fallbackItemName,
        )}</td>
        <td style="padding:8px 0;font-size:14px;color:#3D3935;text-align:right;">${esc(eur(item.priceEur))}</td>
      </tr>`,
    )
    .join("");

  // Convert the `\n` in the signoff to a real <br> so the email
  // template doesn't render the literal newline character.
  const signoffHtml = esc(s.signoff).replace(/\n/g, "<br>");

  const body = `
    <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C8362C;">
      ${esc(s.eyebrow(p.percentOff))}
    </p>
    <h1 style="margin:8px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede(p.percentOff))}
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px 0;border:1px solid rgba(26,26,26,0.10);">
      <tr>
        <td style="padding:18px 18px 6px 18px;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
          ${esc(s.routineLabel)}
        </td>
      </tr>
      <tr>
        <td style="padding:0 18px 6px 18px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${itemsRows}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 18px;border-top:1px solid rgba(26,26,26,0.10);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#8A8A8A;">${esc(s.subtotalLabel)}</td>
              <td style="padding:6px 0;font-size:13px;color:#8A8A8A;text-align:right;text-decoration:line-through;">${esc(eur(subtotal))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#C8362C;font-weight:500;">${esc(s.rewardLabel(p.percentOff))}</td>
              <td style="padding:6px 0;font-size:14px;color:#C8362C;font-weight:500;text-align:right;">${esc(eur(discounted))}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 22px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;">
      ${esc(s.disclaimer(p.expiresOn))}
    </p>

    ${renderCtaButton(restoreUrl, s.cta)}

    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;">
      ${signoffHtml}
    </p>
  `;

  return renderEmailShell({
    title: s.subject(p.percentOff),
    preheader: s.preheader,
    lang: locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });
}
