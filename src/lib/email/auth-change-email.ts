// ─────────────────────────────────────────────────────────────────────────
// Change-email-address email — multilingual.
//
// Fires when a customer changes their email in /account/profile (or
// when an admin changes someone's email in the Supabase admin panel).
// Supabase sends this template to the NEW address as a confirmation
// step before swapping it in.
//
// URL points at our /auth/confirm route with type=email_change. After
// verifyOtp the user is redirected to {{ .RedirectTo }} which we set
// to /[locale]/account/profile so they land back where they made the
// change.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { renderEmailShell, esc, renderCtaButton } from "./html";

type Strings = {
  subject: string;
  preheader: string;
  heading: string;
  lede: string;
  cta: string;
  fallbackIntro: string;
  expiry: string;
  notYouHeading: string;
  notYouBody: string;
  signoff: string;
  footer: string;
};

const STRINGS: Record<Locale, Strings> = {
  EN: {
    subject: "Confirm your new Asian Beauty Shop email",
    preheader: "Tap to confirm the email change.",
    heading: "Confirm your new email.",
    lede: "Someone (we hope it was you) asked to update the email on a Asian Beauty Shop account. Tap the button below to confirm — your account will start using this new address as soon as you do.",
    cta: "Confirm new email",
    fallbackIntro:
      "Trouble with the button? Copy and paste this link into your browser:",
    expiry: "This link expires in 24 hours.",
    notYouHeading: "Not you?",
    notYouBody:
      "If you didn't request this change, you can ignore the email — your account stays on its current address.",
    signoff: "With care,\nThe Asian Beauty Shop team",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Bevestig je nieuwe Asian Beauty Shop-e-mailadres",
    preheader: "Tik om de wijziging te bevestigen.",
    heading: "Bevestig je nieuwe e-mailadres.",
    lede: "Iemand (we hopen jij) heeft gevraagd om het e-mailadres van een Asian Beauty Shop-account aan te passen. Tik op de knop hieronder om te bevestigen — je account gebruikt daarna meteen dit nieuwe adres.",
    cta: "Nieuw e-mailadres bevestigen",
    fallbackIntro:
      "Werkt de knop niet? Kopieer en plak deze link in je browser:",
    expiry: "Deze link vervalt na 24 uur.",
    notYouHeading: "Was jij dat niet?",
    notYouBody:
      "Heb jij deze wijziging niet aangevraagd? Dan kun je deze e-mail negeren — je account blijft op het huidige adres staan.",
    signoff: "Met zorg,\nHet Asian Beauty Shop-team",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Confirmez votre nouvelle adresse Asian Beauty Shop",
    preheader: "Cliquez pour confirmer le changement.",
    heading: "Confirmez votre nouvelle adresse.",
    lede: "Quelqu'un (nous espérons que c'est vous) a demandé à modifier l'adresse e-mail d'un compte Asian Beauty Shop. Cliquez sur le bouton ci-dessous pour confirmer — votre compte utilisera cette nouvelle adresse dès que vous l'aurez fait.",
    cta: "Confirmer la nouvelle adresse",
    fallbackIntro:
      "Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :",
    expiry: "Ce lien expire dans 24 heures.",
    notYouHeading: "Ce n'était pas vous ?",
    notYouBody:
      "Si vous n'avez pas demandé ce changement, ignorez simplement cet e-mail — votre compte reste sur l'adresse actuelle.",
    signoff: "Avec attention,\nL'équipe Asian Beauty Shop",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Подтвердите новый адрес Asian Beauty Shop",
    preheader: "Нажмите, чтобы подтвердить смену адреса.",
    heading: "Подтвердите новый адрес.",
    lede: "Кто-то (надеемся, это вы) попросил изменить адрес e-mail у аккаунта Asian Beauty Shop. Нажмите на кнопку ниже, чтобы подтвердить — аккаунт сразу начнёт использовать новый адрес.",
    cta: "Подтвердить новый адрес",
    fallbackIntro:
      "Кнопка не работает? Скопируйте и вставьте эту ссылку в браузер:",
    expiry: "Срок действия ссылки — 24 часа.",
    notYouHeading: "Это были не вы?",
    notYouBody:
      "Если вы не запрашивали смену, просто проигнорируйте письмо — аккаунт останется на прежнем адресе.",
    signoff: "С заботой,\nКоманда Asian Beauty Shop",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

const URL_SENTINEL = "__SUPABASE_CONFIRM_URL__";
const MUSTACHE_URL =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next={{ .RedirectTo }}";

export type AuthChangeEmailRendered = {
  subject: string;
  html: string;
  text: string;
};

export function buildAuthChangeEmailEmail(
  locale: Locale,
): AuthChangeEmailRendered {
  return assemble(STRINGS[locale], locale);
}

// ────────── Multi-locale variant ────────────────────────────────────────

type LocalisedKey = keyof Strings;

function localised(key: LocalisedKey): string {
  return [
    `{{ if eq (index .Data "locale") "ru" }}${esc(STRINGS.RU[key])}`,
    `{{ else if eq (index .Data "locale") "nl" }}${esc(STRINGS.NL[key])}`,
    `{{ else if eq (index .Data "locale") "fr" }}${esc(STRINGS.FR[key])}`,
    `{{ else }}${esc(STRINGS.EN[key])}{{ end }}`,
  ].join("");
}

export function buildAuthChangeEmailEmailMultiLocale(): AuthChangeEmailRendered {
  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${localised("heading")}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${localised("lede")}
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
      <tr>
        <td style="background:#1A1A1A;">
          <a href="${URL_SENTINEL}"
             style="display:inline-block;padding:14px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#FBF7EF;text-decoration:none;">
            ${localised("cta")}
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 8px 0;font-size:12px;line-height:1.6;color:#6F6A65;">
      ${localised("fallbackIntro")}
    </p>
    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${URL_SENTINEL}" style="color:#C8102E;text-decoration:underline;">${URL_SENTINEL}</a>
    </p>
    <p style="margin:0 0 28px 0;font-size:11px;line-height:1.6;color:#8A8A8A;font-style:italic;">
      ${localised("expiry")}
    </p>

    <hr style="border:none;border-top:1px solid rgba(26,26,26,0.08);margin:28px 0 20px 0;" />

    <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#3D3935;font-weight:500;">
      ${localised("notYouHeading")}
    </p>
    <p style="margin:0 0 28px 0;font-size:13px;line-height:1.6;color:#6F6A65;">
      ${localised("notYouBody")}
    </p>

    <p style="margin:32px 0 0 0;font-size:13px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${localised("signoff")}
    </p>
  `;

  const shell = renderEmailShell({
    title: STRINGS.EN.subject,
    preheader: STRINGS.EN.preheader,
    lang: "en",
    body,
    footerNote: STRINGS.EN.footer,
  });

  const html = shell.replaceAll(URL_SENTINEL, MUSTACHE_URL);

  const text = [
    localised("heading"),
    "",
    localised("lede"),
    "",
    `${localised("cta")}: ${MUSTACHE_URL}`,
    "",
    localised("expiry"),
    "",
    `${localised("notYouHeading")} ${localised("notYouBody")}`,
    "",
    localised("signoff").replace(/\n/g, " — "),
    "",
    localised("footer"),
  ].join("\n");

  return { subject: STRINGS.EN.subject, html, text };
}

function assemble(s: Strings, locale: Locale): AuthChangeEmailRendered {
  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede)}
    </p>

    ${renderCtaButton(URL_SENTINEL, s.cta)}

    <p style="margin:24px 0 8px 0;font-size:12px;line-height:1.6;color:#6F6A65;">
      ${esc(s.fallbackIntro)}
    </p>
    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${URL_SENTINEL}" style="color:#C8102E;text-decoration:underline;">${URL_SENTINEL}</a>
    </p>
    <p style="margin:0 0 28px 0;font-size:11px;line-height:1.6;color:#8A8A8A;font-style:italic;">
      ${esc(s.expiry)}
    </p>

    <hr style="border:none;border-top:1px solid rgba(26,26,26,0.08);margin:28px 0 20px 0;" />

    <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#3D3935;font-weight:500;">
      ${esc(s.notYouHeading)}
    </p>
    <p style="margin:0 0 28px 0;font-size:13px;line-height:1.6;color:#6F6A65;">
      ${esc(s.notYouBody)}
    </p>

    <p style="margin:32px 0 0 0;font-size:13px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(s.signoff)}
    </p>
  `;

  const shell = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: locale.toLowerCase(),
    body,
    footerNote: s.footer,
  });

  const html = shell.replaceAll(URL_SENTINEL, MUSTACHE_URL);

  const text = [
    s.heading,
    "",
    s.lede,
    "",
    `${s.cta}: ${MUSTACHE_URL}`,
    "",
    s.expiry,
    "",
    `${s.notYouHeading} ${s.notYouBody}`,
    "",
    s.signoff.replace(/\n/g, " — "),
    "",
    s.footer,
  ].join("\n");

  return { subject: s.subject, html, text };
}
