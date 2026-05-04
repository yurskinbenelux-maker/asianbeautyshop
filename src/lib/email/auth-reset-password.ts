// ─────────────────────────────────────────────────────────────────────────
// Reset-password email — multilingual.
//
// Fires when a customer clicks "Forgot password" on /[locale]/sign-in.
// Supabase's resetPasswordForEmail() generates a recovery token and
// sends this template via SMTP.
//
// Multilingual via Supabase Go-template conditionals on the user's
// stored metadata (`Data.locale`). Customers who registered before we
// stored locale fall back to EN.
//
// URL points at our /auth/confirm route with type=recovery. The route
// calls verifyOtp, mints a recovery session, and redirects to
// `{{ .RedirectTo }}` which forgot-password/actions.ts sets to
// /[locale]/reset-password — where the customer types a new password.
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
    subject: "Reset your YU.R password",
    preheader: "Tap the button to choose a new password.",
    heading: "Reset your password.",
    lede: "Tap the button below to set a new password for your YU.R account. The link is good for 60 minutes.",
    cta: "Reset my password",
    fallbackIntro:
      "Trouble with the button? Copy and paste this link into your browser:",
    expiry: "This link expires in 60 minutes.",
    notYouHeading: "Didn't request this?",
    notYouBody:
      "If you didn't ask to reset your password, you can ignore this email — your account is safe and your current password still works.",
    signoff: "With care,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Stel je YU.R-wachtwoord opnieuw in",
    preheader: "Tik op de knop om een nieuw wachtwoord te kiezen.",
    heading: "Wachtwoord opnieuw instellen.",
    lede: "Tik op de knop hieronder om een nieuw wachtwoord voor je YU.R-account in te stellen. De link is 60 minuten geldig.",
    cta: "Wachtwoord opnieuw instellen",
    fallbackIntro:
      "Werkt de knop niet? Kopieer en plak deze link in je browser:",
    expiry: "Deze link vervalt na 60 minuten.",
    notYouHeading: "Niet aangevraagd?",
    notYouBody:
      "Heb jij geen wachtwoordherstel aangevraagd? Dan kun je deze e-mail rustig negeren — je account is veilig en je huidige wachtwoord blijft werken.",
    signoff: "Met zorg,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Réinitialisez votre mot de passe YU.R",
    preheader:
      "Cliquez sur le bouton pour choisir un nouveau mot de passe.",
    heading: "Réinitialiser le mot de passe.",
    lede: "Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe pour votre compte YU.R. Le lien est valable 60 minutes.",
    cta: "Réinitialiser mon mot de passe",
    fallbackIntro:
      "Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :",
    expiry: "Ce lien expire dans 60 minutes.",
    notYouHeading: "Vous n'avez pas demandé cela ?",
    notYouBody:
      "Si vous n'avez pas demandé de réinitialisation, ignorez simplement cet e-mail — votre compte est en sécurité et votre mot de passe actuel reste valable.",
    signoff: "Avec attention,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Сброс пароля YU.R",
    preheader: "Нажмите на кнопку, чтобы выбрать новый пароль.",
    heading: "Сброс пароля.",
    lede: "Нажмите на кнопку ниже, чтобы задать новый пароль для аккаунта YU.R. Ссылка действует 60 минут.",
    cta: "Сбросить пароль",
    fallbackIntro:
      "Кнопка не работает? Скопируйте и вставьте эту ссылку в браузер:",
    expiry: "Срок действия ссылки — 60 минут.",
    notYouHeading: "Это были не вы?",
    notYouBody:
      "Если вы не запрашивали сброс, просто проигнорируйте письмо — ваш аккаунт в безопасности, текущий пароль продолжит работать.",
    signoff: "С заботой,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

const URL_SENTINEL = "__SUPABASE_CONFIRM_URL__";
const MUSTACHE_URL =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next={{ .RedirectTo }}";

export type AuthResetPasswordRendered = {
  subject: string;
  html: string;
  text: string;
};

// Per-locale builder — used by the admin previewer to show how each
// language renders. NOT pasted into Supabase directly (Supabase only
// accepts ONE template); the multilingual variant below is what ships.
export function buildAuthResetPasswordEmail(
  locale: Locale,
): AuthResetPasswordRendered {
  const s = STRINGS[locale];
  return assemble(s, locale);
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

export function buildAuthResetPasswordEmailMultiLocale(): AuthResetPasswordRendered {
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

// Single-locale assembly — same shape as auth-confirm.ts; used only by
// the per-locale preview entries in the admin emails registry.
function assemble(s: Strings, locale: Locale): AuthResetPasswordRendered {
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
