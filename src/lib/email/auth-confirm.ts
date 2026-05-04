// ─────────────────────────────────────────────────────────────────────────
// Auth confirmation email — YU.R-branded replacement for Supabase's
// default "Confirm your email" template.
//
// HOW THIS GETS DELIVERED
// ───────────────────────
// Unlike every other email in this folder, we DON'T send this one
// ourselves via Resend at runtime. Supabase Auth handles the magic-link
// flow end-to-end — token generation, click verification, session
// minting — and sends the email through whatever SMTP it's configured
// with. So the path is:
//
//   1. Customer submits sign-up form → supabase.auth.signUp()
//   2. Supabase generates a confirmation token + URL
//   3. Supabase looks up the "Confirm signup" template in its dashboard
//   4. Supabase substitutes {{ .ConfirmationURL }} and sends the email
//
// We control step 3 by pasting THIS template's HTML output into the
// Supabase dashboard once. After that, every signup email is branded
// YU.R automatically — no code path involved at runtime.
//
// SETUP — TWO ONE-TIME STEPS IN SUPABASE
// ──────────────────────────────────────
//
//   A. Custom SMTP (so the email comes from yurskinsolution.eu, not
//      supabase's noreply@mail.app.supabase.io):
//        Supabase Dashboard → Project Settings → Authentication
//        → SMTP Settings → enable "Custom SMTP"
//        Host:     smtp.resend.com
//        Port:     465
//        Username: resend
//        Password: <your Resend API key, the one in RESEND_API_KEY>
//        Sender:   hello@yurskinsolution.eu  (or noreply@)
//        Sender:   YU.R Skin Solution
//
//   B. The template itself:
//        Supabase Dashboard → Authentication → Email Templates
//        → "Confirm signup" → switch to HTML → paste the output of
//        renderAuthConfirmEmail(Locale.EN).html
//
//      The Subject line is also editable in the same form — paste
//      the .subject value too.
//
// LOCALE SELECTION
// ────────────────
// Supabase's email template is a single piece of HTML; it doesn't
// switch on the user's locale. Pragmatic choice: ship the EN version
// in Supabase. Bilingual customers reading EN works fine. If Sofia
// later wants per-locale templates we can move to the Send Email Hook
// (Edge Function) approach which lets us swap templates at send time.
//
// PLACEHOLDER STRATEGY
// ────────────────────
// Supabase substitutes {{ .ConfirmationURL }} and {{ .Email }} via Go
// templates. Our esc() helper would HTML-encode the curly braces and
// break the substitution. We solve this by composing the body with
// __SENTINEL__ placeholders, then string-replacing them with the
// literal mustache tokens AFTER the HTML is assembled. The sentinels
// never reach the inbox.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { renderEmailShell, esc, renderCtaButton } from "./html";

// ────────── per-locale copy ─────────────────────────────────────────────

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
    subject: "Confirm your YU.R account",
    preheader: "One tap to confirm your email and start your ritual.",
    heading: "Welcome to YU.R.",
    lede: "We're glad you're here. Tap the button below to confirm your email and finish setting up your account — it keeps your basket safe and lets us send your order updates.",
    cta: "Confirm my email",
    fallbackIntro:
      "Trouble with the button? Copy and paste this link into your browser:",
    expiry: "This link expires in 24 hours.",
    notYouHeading: "Didn't sign up?",
    notYouBody:
      "If this wasn't you, you can ignore this email — no account will be created.",
    signoff: "With care,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgium",
  },
  NL: {
    subject: "Bevestig je YU.R-account",
    preheader: "Eén tik om je e-mail te bevestigen en je ritueel te starten.",
    heading: "Welkom bij YU.R.",
    lede: "Fijn dat je er bent. Tik op de knop hieronder om je e-mail te bevestigen en je account af te ronden — zo blijft je winkelmand bewaard en kunnen we je bestellingsupdates sturen.",
    cta: "Bevestig mijn e-mail",
    fallbackIntro:
      "Werkt de knop niet? Kopieer en plak deze link in je browser:",
    expiry: "Deze link vervalt na 24 uur.",
    notYouHeading: "Niet aangemeld?",
    notYouBody:
      "Was jij dit niet? Dan kun je deze e-mail rustig negeren — er wordt geen account aangemaakt.",
    signoff: "Met zorg,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, België",
  },
  FR: {
    subject: "Confirmez votre compte YU.R",
    preheader:
      "Un clic pour confirmer votre adresse et commencer votre rituel.",
    heading: "Bienvenue chez YU.R.",
    lede: "Heureux de vous accueillir. Cliquez sur le bouton ci-dessous pour confirmer votre adresse et finaliser la création de votre compte — cela conserve votre panier et nous permet de vous envoyer les mises à jour de commande.",
    cta: "Confirmer mon e-mail",
    fallbackIntro:
      "Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :",
    expiry: "Ce lien expire dans 24 heures.",
    notYouHeading: "Vous n'êtes pas à l'origine de cette inscription ?",
    notYouBody:
      "Si ce n'est pas vous, ignorez simplement cet e-mail — aucun compte ne sera créé.",
    signoff: "Avec attention,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Aartselaar, Belgique",
  },
  RU: {
    subject: "Подтвердите ваш аккаунт YU.R",
    preheader:
      "Один клик, чтобы подтвердить почту и начать ваш уход.",
    heading: "Добро пожаловать в YU.R.",
    lede: "Рады, что вы с нами. Нажмите на кнопку ниже, чтобы подтвердить адрес и завершить создание аккаунта — это сохранит вашу корзину и позволит нам отправлять обновления по заказу.",
    cta: "Подтвердить почту",
    fallbackIntro:
      "Кнопка не работает? Скопируйте и вставьте эту ссылку в браузер:",
    expiry: "Срок действия ссылки — 24 часа.",
    notYouHeading: "Это были не вы?",
    notYouBody:
      "Если регистрировались не вы, просто проигнорируйте письмо — аккаунт не будет создан.",
    signoff: "С заботой,\nYU.R Skin Solution",
    footer: "K'Elmus Group BV · Артселар, Бельгия",
  },
};

// ────────── Supabase mustache tokens ────────────────────────────────────
//
// These get replaced by Supabase at send time. We use sentinels in our
// HTML composer (which goes through esc()) and swap them for the real
// tokens at the very end. See PLACEHOLDER STRATEGY note above.
//
// We deliberately DON'T use {{ .ConfirmationURL }} — that resolves to
// `https://<project>.supabase.co/auth/v1/verify?...` which (a) looks
// like a phishing redirect to customers and (b) puts us on Supabase's
// PKCE flow which is fragile across browsers and pre-fetches.
//
// Instead, the URL points at our own /auth/confirm route on
// yurskinsolution.eu. Supabase substitutes:
//   {{ .SiteURL }}    → "https://yurskinsolution.eu"
//   {{ .TokenHash }}  → the email-token hash for verifyOtp()
//   {{ .RedirectTo }} → whatever emailRedirectTo we set in signUp() —
//                       in our case the locale-aware /[locale]/account URL
//
// Our /auth/confirm route handler does the verifyOtp call and 302s
// the customer to the `next` query param.
const URL_SENTINEL = "__SUPABASE_CONFIRM_URL__";
const EMAIL_SENTINEL = "__SUPABASE_EMAIL__";

const MUSTACHE_URL =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}";
const MUSTACHE_EMAIL = "{{ .Email }}";

// ────────── Public API ──────────────────────────────────────────────────

export type AuthConfirmRendered = {
  subject: string;
  /**
   * Full HTML ready to paste into Supabase. Contains literal
   * `{{ .ConfirmationURL }}` mustache tokens that Supabase substitutes
   * server-side when the email is sent.
   */
  html: string;
  /** Plain-text fallback. Same mustache tokens; Supabase substitutes too. */
  text: string;
};

/**
 * Build the YU.R-branded confirmation email for a given locale.
 *
 * The result is meant to be pasted ONCE into Supabase Dashboard →
 * Authentication → Email Templates → Confirm signup. Re-render and
 * re-paste whenever copy changes (rare).
 */
export function buildAuthConfirmEmail(locale: Locale): AuthConfirmRendered {
  const s = STRINGS[locale];

  // Body composition — sentinels get swapped to mustache tokens after
  // renderEmailShell wraps everything (so esc() doesn't mangle them).
  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(s.heading)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(s.lede)}
    </p>

    ${renderCtaButton(URL_SENTINEL, s.cta)}

    <!-- Fallback link block — bordered + monospace so even if the CTA
         button doesn't render (Outlook desktop especially), the user
         still has a copy-pasteable URL. -->
    <p style="margin:24px 0 8px 0;font-size:12px;line-height:1.6;color:#6F6A65;">
      ${esc(s.fallbackIntro)}
    </p>
    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;word-break:break-all;">
      <a href="${URL_SENTINEL}" style="color:#C8102E;text-decoration:underline;">
        ${URL_SENTINEL}
      </a>
    </p>
    <p style="margin:0 0 28px 0;font-size:11px;line-height:1.6;color:#8A8A8A;font-style:italic;">
      ${esc(s.expiry)}
    </p>

    <hr style="border:none;border-top:1px solid rgba(26,26,26,0.08);margin:28px 0 20px 0;" />

    <!-- "Didn't sign up?" — stays calm, doesn't accuse. -->
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

  // Final swap — sentinels → Supabase mustache tokens. Done LAST so
  // nothing in the assembly pipeline (esc, shell) touches the curly
  // braces. The sentinels are URL-unsafe-looking so they can't appear
  // organically in any of our copy.
  const html = shell
    .replaceAll(URL_SENTINEL, MUSTACHE_URL)
    .replaceAll(EMAIL_SENTINEL, MUSTACHE_EMAIL);

  // Plain-text fallback — Supabase has a separate "Plain text" tab in
  // the template editor. Many corporate email gateways prefer the text
  // version, so it's worth having one.
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

// ──────────────────────────────────────────────────────────────────────────
// Multi-locale variant — Supabase Go-template conditionals
// ──────────────────────────────────────────────────────────────────────────
//
// Supabase email templates run through Go's text/template engine, which
// supports `{{ if eq .Field "value" }}…{{ end }}` conditionals. We pass
// the customer's locale via signUp's `data.locale` field — accessible
// in the template as `{{ index .Data "locale" }}`.
//
// Strategy: compose a single big HTML doc where each translated string
// is wrapped in:
//
//   {{ if eq (index .Data "locale") "ru" }}<russian>{{ else if eq … }}…
//   {{ else }}<english default>{{ end }}
//
// The template still has all 4 languages baked in; Supabase renders the
// matching arm at send time. EN is the `else` branch — used both when
// the user picked "en" AND when locale is missing entirely (e.g. an
// older account that signed up before we added the metadata).

type LocalisedKey = keyof Strings;

/**
 * Wrap a per-key string set in a Go-template if/else chain.
 * EN is the default fallback so anyone without a locale value still
 * gets a readable email.
 */
function localised(key: LocalisedKey): string {
  const en = STRINGS.EN[key];
  const nl = STRINGS.NL[key];
  const fr = STRINGS.FR[key];
  const ru = STRINGS.RU[key];
  // Go template syntax — Supabase substitutes at send time. The strings
  // we drop in are pre-escaped via esc() to keep & < > safe in HTML.
  return [
    `{{ if eq (index .Data "locale") "ru" }}${esc(ru)}`,
    `{{ else if eq (index .Data "locale") "nl" }}${esc(nl)}`,
    `{{ else if eq (index .Data "locale") "fr" }}${esc(fr)}`,
    `{{ else }}${esc(en)}{{ end }}`,
  ].join("");
}

/**
 * Same as buildAuthConfirmEmail but produces a SINGLE HTML doc that
 * switches all four languages at Supabase send time. This is what we
 * actually paste into Supabase — covers every customer regardless of
 * the locale they picked at signup, with EN as a graceful default.
 *
 * The subject line is tricky: Supabase only allows ONE subject. We pick
 * EN — short, recognisable, the most likely default for a Belgium-based
 * shop. The body is fully localised so the email itself reads correctly.
 */
export function buildAuthConfirmEmailMultiLocale(): AuthConfirmRendered {
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

  // Shell `lang` attribute — we pick EN since the doc itself contains
  // every language. Mail clients use this for hyphenation only.
  const shell = renderEmailShell({
    title: STRINGS.EN.subject,
    preheader: STRINGS.EN.preheader,
    lang: "en",
    body,
    footerNote: STRINGS.EN.footer,
  });

  const html = shell
    .replaceAll(URL_SENTINEL, MUSTACHE_URL)
    .replaceAll(EMAIL_SENTINEL, MUSTACHE_EMAIL);

  // Plain-text fallback also gets the conditional treatment so the
  // text-only client of a Russian customer still reads in Russian.
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

  return {
    subject: STRINGS.EN.subject,
    html,
    text,
  };
}
