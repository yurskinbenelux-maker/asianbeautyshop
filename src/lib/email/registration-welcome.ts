// ─────────────────────────────────────────────────────────────────────────
// Registration welcome — sent ONCE per account, immediately after the
// customer clicks the email-confirmation link from /sign-up. Carries
// the deterministic single-use 10%-off coupon minted by
// issueRegistrationWelcomeCoupon.
//
// Tone: warmer than transactional, quieter than promo. The discount is
// the carrot but it's framed as a thank-you for joining — not a coupon
// drop. English-only by design: the popup that drives this signup is
// English-only too (Max's call, kept consistent across surfaces).
// ─────────────────────────────────────────────────────────────────────────

import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";

export type RegistrationWelcomePayload = {
  email: string;
  couponCode: string;
  /** Percent off (e.g. 10). Used in the email body copy. */
  percentOff: number;
  /** Validity window in days (e.g. 60). Surfaced in the fine print. */
  validDays: number;
};

export type RegistrationWelcomeSendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

const SUBJECT = "Welcome to YU.R — your 10% is inside";
const PREHEADER = "Your code is waiting, and so is your skincare routine.";
const HEADING = "Welcome.";
const LEDE =
  "Thank you for joining us. Your account is ready — order tracking, saved addresses, and your skin-quiz history all live there from now on. As a small hello, here's a single-use code for your first order.";
const CODE_LABEL = "Your welcome code";
const CTA = "Start your skincare routine";
const SIGNOFF = "With care,\nSofia · YU.R Skin Solution";
const FOOTER = "K'Elmus Group BV · Aartselaar, Belgium";

export async function sendRegistrationWelcomeEmail(
  payload: RegistrationWelcomePayload,
): Promise<RegistrationWelcomeSendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://yurskinsolution.eu";
  // English shop link — the popup is English-only and the email follows
  // the same convention. Customers can language-switch from the nav.
  const shopUrl = `${siteOrigin}/en/shop`;
  const html = renderHtml(payload, shopUrl);

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: SUBJECT,
      html,
      tags: [
        { name: "type", value: "registration_welcome" },
        { name: "coupon", value: payload.couponCode },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/registration-welcome] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}

function renderHtml(p: RegistrationWelcomePayload, shopUrl: string): string {
  const codeNote = `Use it once for ${p.percentOff}% off your first order. Valid for ${p.validDays} days.`;

  const body = `
    <h1 style="margin:24px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      ${esc(HEADING)}
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      ${esc(LEDE)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;border:1px solid rgba(26,26,26,0.12);">
      <tr>
        <td style="padding:20px 16px;text-align:center;">
          <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            ${esc(CODE_LABEL)}
          </p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:22px;letter-spacing:0.18em;color:#121110;">
            ${esc(p.couponCode)}
          </p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 28px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;text-align:center;">
      ${esc(codeNote)}
    </p>
    ${renderCtaButton(shopUrl, CTA)}
    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;white-space:pre-line;">
      ${esc(SIGNOFF)}
    </p>
  `;

  return renderEmailShell({
    title: SUBJECT,
    preheader: PREHEADER,
    lang: "en",
    body,
    footerNote: FOOTER,
  });
}
