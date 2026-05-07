// ─────────────────────────────────────────────────────────────────────────
// Newsletter confirmation email — double opt-in.
//
// Refactored to use the shared `renderEmailShell` scaffold from
// @/lib/email/html so this template now matches every other customer-
// facing YU.R email pixel-for-pixel: logo PNG header, ivory card on
// rice paper, vermilion CTA button, Aartselaar address. Previously
// it had its own inlined scaffold (legacy, predated the helper) and
// drifted on three details — Hangul seal "유알" in the header (retired
// in #142), wrong city in the footer ("Brussels" → should be
// "Aartselaar"), and no logo image.
//
// Copy unchanged. All 4 locales still localised.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { esc, renderCtaButton, renderEmailShell } from "@/lib/email/html";
import {
  applyOverrides,
  type EmailOverrides,
} from "@/lib/email/copy-overrides";

// ────────── per-locale strings ──────────────────────────────────────────

type Strings = {
  subject: string;
  preheader: string;
  greeting: string;
  lede: string;
  cta: string;
  alt: string;
  signoff: string;
  // GDPR-required disclaimer that explains WHY the user received this
  // email even though they may not remember signing up. Stays inside
  // the card (not the shell footer) because the shell footer is for
  // the company identity line only.
  disclaimer: string;
};

export const NEWSLETTER_CONFIRM_STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Confirm your subscription — YU.R Skin Solution",
    preheader: "One click to confirm your place on the monthly letter.",
    greeting: "Hello,",
    lede: "Thank you for signing up to the YU.R letter. Please confirm your email address so we know we have the right inbox.",
    cta: "Confirm my subscription",
    alt: "If the button above doesn't work, copy and paste this link into your browser:",
    signoff: "— The YU.R team",
    disclaimer:
      "You received this email because someone entered this address on yurskinsolution.eu. If it wasn't you, you can ignore this message — we won't add you without confirmation.",
  },
  NL: {
    subject: "Bevestig je inschrijving — YU.R Skin Solution",
    preheader: "Eén klik om je plek op de maandelijkse brief te bevestigen.",
    greeting: "Hallo,",
    lede: "Bedankt voor je inschrijving op de YU.R-brief. Bevestig je e-mailadres zodat we weten dat we het juiste postvak hebben.",
    cta: "Inschrijving bevestigen",
    alt: "Werkt de knop niet? Kopieer dan deze link naar je browser:",
    signoff: "— Het YU.R-team",
    disclaimer:
      "Je ontvangt deze e-mail omdat iemand dit adres heeft ingevoerd op yurskinsolution.eu. Als dat niet jij was, kun je dit bericht negeren — we voegen je pas toe na bevestiging.",
  },
  FR: {
    subject: "Confirmez votre inscription — YU.R Skin Solution",
    preheader: "Un clic pour confirmer votre place dans la lettre mensuelle.",
    greeting: "Bonjour,",
    lede: "Merci de vous être inscrit·e à la lettre YU.R. Veuillez confirmer votre adresse pour que nous sachions que c'est bien la bonne.",
    cta: "Confirmer mon inscription",
    alt: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    signoff: "— L'équipe YU.R",
    disclaimer:
      "Vous recevez cet e-mail parce que quelqu'un a saisi cette adresse sur yurskinsolution.eu. Si ce n'était pas vous, vous pouvez ignorer ce message — nous ne vous ajouterons pas sans confirmation.",
  },
  RU: {
    subject: "Подтвердите подписку — YU.R Skin Solution",
    preheader: "Один клик, чтобы подтвердить подписку на ежемесячное письмо.",
    greeting: "Здравствуйте,",
    lede: "Спасибо за подписку на письмо YU.R. Подтвердите, пожалуйста, ваш адрес, чтобы мы были уверены, что это нужный ящик.",
    cta: "Подтвердить подписку",
    alt: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
    signoff: "— Команда YU.R",
    disclaimer:
      "Вы получили это письмо, потому что кто-то ввёл этот адрес на yurskinsolution.eu. Если это были не вы — просто проигнорируйте его; без подтверждения мы не добавим вас в список.",
  },
};

// ────────── HTML builder ────────────────────────────────────────────────

export type ConfirmationEmailInput = {
  confirmUrl: string;
  locale: Locale;
  /** Optional admin-edited copy overrides keyed by field name. */
  overrides?: EmailOverrides;
};

/**
 * Build { subject, html, text } for the confirmation email.
 * Routes through renderEmailShell so the brand presentation stays in
 * lockstep with order-confirmation, newsletter-welcome, etc.
 */
export function buildConfirmationEmail(input: ConfirmationEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const s = applyOverrides(
    NEWSLETTER_CONFIRM_STRINGS[input.locale] ?? NEWSLETTER_CONFIRM_STRINGS.EN,
    input.overrides,
  );
  const url = input.confirmUrl;

  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#121110;font-weight:400;">
      ${esc(s.greeting)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede)}
    </p>

    ${renderCtaButton(url, s.cta)}

    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#6F6A65;">
      ${esc(s.alt)}
    </p>
    <p style="margin:0 0 32px 0;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${esc(url)}" style="color:#C8102E;text-decoration:underline;">${esc(url)}</a>
    </p>

    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#3D3935;">
      ${esc(s.signoff)}
    </p>

    <hr style="border:none;border-top:1px solid rgba(26,26,26,0.08);margin:24px 0 16px 0;" />

    <p style="margin:0;font-size:11px;line-height:1.6;color:#8A8A8A;">
      ${esc(s.disclaimer)}
    </p>
  `;

  const html = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: input.locale.toLowerCase(),
    body,
  });

  const text = [
    s.greeting,
    "",
    s.lede,
    "",
    `${s.cta}: ${url}`,
    "",
    s.signoff,
    "",
    "—",
    s.disclaimer,
  ].join("\n");

  return { subject: s.subject, html, text };
}
