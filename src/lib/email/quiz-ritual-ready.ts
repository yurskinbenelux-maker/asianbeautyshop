// ─────────────────────────────────────────────────────────────────────────
// Quiz ritual ready email — fires once per quiz completion (per the
// idempotent recordQuizCompletion). Carries the cart-restore magic link
// so the customer can come back any time in the next 60 days and pick
// up exactly the ritual they were shown after the quiz.
//
// English-only by design — matches the popup convention. The link is
// account-scoped so the email feels personal even though the copy is
// generic.
// ─────────────────────────────────────────────────────────────────────────

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
};

export type QuizRitualReadySendResult =
  | { sent: true }
  | { sent: false; reason: "resend-not-configured" | "send-failed" };

const SUBJECT = "Your YU.R ritual is ready · save 15%";
const PREHEADER = "Your skin quiz, packaged. Open it any time in the next 60 days.";

export async function sendQuizRitualReadyEmail(
  payload: QuizRitualReadyPayload,
): Promise<QuizRitualReadySendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "resend-not-configured" };

  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://yurskinsolution.eu";
  const restoreUrl = `${siteOrigin}/en/quiz/restore?token=${encodeURIComponent(
    payload.cartLinkToken,
  )}`;
  const html = renderHtml(payload, restoreUrl);

  try {
    await resend.emails.send({
      from: fromTransactional(),
      to: payload.email,
      replyTo: replyToAddress(),
      subject: SUBJECT,
      html,
      tags: [
        { name: "type", value: "quiz_ritual_ready" },
        { name: "percent_off", value: String(payload.percentOff) },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email/quiz-ritual-ready] send failed", err);
    return { sent: false, reason: "send-failed" };
  }
}

function renderHtml(p: QuizRitualReadyPayload, restoreUrl: string): string {
  const eur = (n: number): string =>
    new Intl.NumberFormat("en-IE", {
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
        <td style="padding:8px 0;font-size:14px;color:#3D3935;">${esc(item.name)}</td>
        <td style="padding:8px 0;font-size:14px;color:#3D3935;text-align:right;">${esc(eur(item.priceEur))}</td>
      </tr>`,
    )
    .join("");

  const body = `
    <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#C8362C;">
      Quiz reward · ${p.percentOff}% off
    </p>
    <h1 style="margin:8px 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.2;color:#121110;font-weight:400;">
      Your skin quiz, packaged.
    </h1>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#3D3935;">
      Based on your quiz answers, we put a personal ritual together for you.
      Tap the button below any time in the next 60 days and we'll restore
      this exact cart with ${p.percentOff}% off the items below.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px 0;border:1px solid rgba(26,26,26,0.10);">
      <tr>
        <td style="padding:18px 18px 6px 18px;font-family:Georgia,serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
          Your ritual
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
              <td style="padding:6px 0;font-size:13px;color:#8A8A8A;">Subtotal</td>
              <td style="padding:6px 0;font-size:13px;color:#8A8A8A;text-align:right;text-decoration:line-through;">${esc(eur(subtotal))}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#C8362C;font-weight:500;">Quiz reward (−${p.percentOff}%)</td>
              <td style="padding:6px 0;font-size:14px;color:#C8362C;font-weight:500;text-align:right;">${esc(eur(discounted))}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 22px 0;font-size:12px;line-height:1.6;color:#6F6A65;font-style:italic;">
      Single-use link, expires ${esc(p.expiresOn)}. The discount applies
      only to the items above — anything you add afterwards stays at full
      price. Once you place an order with this code, the link goes quiet.
    </p>

    ${renderCtaButton(restoreUrl, "Open my ritual cart")}

    <p style="margin:40px 0 0 0;font-size:14px;line-height:1.6;color:#3D3935;">
      With care,<br>
      Sofia · YU.R Skin Solution
    </p>
  `;

  return renderEmailShell({
    title: SUBJECT,
    preheader: PREHEADER,
    lang: "en",
    body,
    footerNote: "K'Elmus Group BV · Aartselaar, Belgium",
  });
}
