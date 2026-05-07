// ─────────────────────────────────────────────────────────────────────────
// Magic-link email — admin-only sign-in.
//
// Fires when an admin types their email at /sign-in (the top-level
// admin page; the customer-facing /[locale]/sign-in uses email +
// password). Supabase's signInWithOtp() generates a one-time token
// and sends this template via the SMTP we configured.
//
// EN-only on purpose — the audience is an admin, Max, and a possible
// future fulfilment hire, all Belgium-based and EN-comfortable.
// signInWithOtp doesn't accept a `data: { locale }` field anyway,
// so we couldn't switch templates by locale even if we wanted to.
//
// URL format mirrors the confirm-signup flow: /auth/confirm with
// type=magiclink. Our route handler treats both paths identically —
// verifyOtp({ token_hash, type }) → session → redirect to `next`.
// ─────────────────────────────────────────────────────────────────────────

import { renderEmailShell, esc, renderCtaButton } from "./html";

// Sentinels swapped to Supabase mustache tokens after esc() runs. See
// auth-confirm.ts for the rationale.
const URL_SENTINEL = "__SUPABASE_CONFIRM_URL__";
const MUSTACHE_URL =
  "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}";

const STRINGS = {
  subject: "Sign in to Asian Beauty Shop",
  preheader: "Tap the button to sign in.",
  heading: "Sign in to Asian Beauty Shop.",
  lede: "Tap the button below to access the Asian Beauty Shop admin. The link is good for 60 minutes and works once.",
  cta: "Sign me in",
  fallbackIntro:
    "Trouble with the button? Copy and paste this link into your browser:",
  expiry: "This link expires in 60 minutes.",
  notYouHeading: "Didn't request this?",
  notYouBody:
    "If you didn't ask to sign in, you can safely ignore this email. The link won't do anything until someone clicks it.",
  signoff: "Asian Beauty Shop",
  footer: "K'Elmus Group BV · Aartselaar, Belgium",
};

export type AuthMagicLinkRendered = {
  subject: string;
  html: string;
  text: string;
};

export function buildAuthMagicLinkEmail(): AuthMagicLinkRendered {
  const s = STRINGS;

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

    <p style="margin:32px 0 0 0;font-size:13px;line-height:1.6;color:#3D3935;">
      ${esc(s.signoff)}
    </p>
  `;

  const shell = renderEmailShell({
    title: s.subject,
    preheader: s.preheader,
    lang: "en",
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
    s.signoff,
    "",
    s.footer,
  ].join("\n");

  return { subject: s.subject, html, text };
}
