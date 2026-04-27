// ─────────────────────────────────────────────────────────────────────────
// Email HTML primitives — shared scaffold used across every transactional
// email (order confirmation, shipped, admin alerts, newsletter).
//
// Why inline HTML strings instead of React Email:
//   • zero dependencies — ships with the same bundle size whether we send
//     one email per week or ten thousand
//   • every major webmail (Gmail, Outlook web, Apple Mail) parses the
//     table-based markup here without surprises
//   • the brand voice is quiet; we don't need a component library to
//     render four rectangles and some serif type
//
// Every template that needs paper + ivory + sumi ink + vermilion accents
// should import `renderEmailShell` rather than repeating the scaffold.
// ─────────────────────────────────────────────────────────────────────────

/** Small, defensive HTML escape. Never trust our own strings fully. */
export function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailShellInput = {
  /** Browser tab / subject-line fallback. Already escaped by renderEmailShell. */
  title: string;
  /** Preview text shown in inbox list. Already escaped. */
  preheader: string;
  /** lang="…" attribute on <html>. */
  lang: string;
  /** Rendered HTML body (already sanitised by caller). */
  body: string;
  /** Optional footer note (appears beneath the card). Plain text, escaped. */
  footerNote?: string;
  /**
   * Optional second footer line with business identifiers
   * (VAT + IBAN) — used on customer receipts to satisfy EU invoice
   * transparency. Internal admin notifications leave it empty.
   */
  legalLine?: string;
};

/**
 * Canonical business identifiers that should appear on every customer
 * receipt (order confirmation, shipped, cancelled, refunded). Kept as a
 * single exported constant so legal/finance changes live in one place.
 */
export const BUSINESS_LEGAL_LINE =
  "VAT BE 1031.312.116 · IBAN BE96 0689 5761 0905 · BIC GKCCBEBB";

/**
 * Wrap an inner HTML string in the standard YU.R email shell.
 * Outer page background is rice (#F3EDE3); inner card is ivory (#FBF7EF).
 *
 * Header: a small hosted PNG logo (apple-touch-icon, 56×56) sits above a
 * thin "YU.R Skin Solution" wordmark eyebrow. If the recipient's client
 * blocks images by default (Gmail, Outlook), the wordmark text alone still
 * brands the email. The Hangul seal "유알" was retired in the 2026-04
 * brand sweep — emails now match the site's wordmark-only treatment.
 */
export function renderEmailShell(input: EmailShellInput): string {
  const footer =
    input.footerNote ??
    "K'Elmus Group BV · Aartselaar, Belgium";

  // Absolute URL is required — Gmail and most webmail clients won't
  // resolve relative paths in <img src>. We pin to the canonical origin
  // and rely on the brand PNG icon set living at /brand/.
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://yurskinsolution.eu";
  const logoUrl = `${siteOrigin}/brand/apple-touch-icon.png`;

  return /* html */ `<!doctype html>
<html lang="${esc(input.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${esc(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F3EDE3;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;">
    <!-- preheader (hidden, shows in inbox preview) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${esc(input.preheader)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EDE3;">
      <tr>
        <td align="center" style="padding:48px 20px;">
          <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#FBF7EF;border:1px solid rgba(26,26,26,0.08);">
            <tr>
              <td style="padding:40px 44px 36px 44px;">

                <!-- logo header — image with text fallback for blocked-image inboxes -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px 0;">
                  <tr>
                    <td style="padding:0;">
                      <img src="${logoUrl}" alt="YU.R" width="48" height="48" style="display:block;width:48px;height:48px;border:0;outline:none;text-decoration:none;background:#F3EDE3;" />
                    </td>
                  </tr>
                </table>
                <div style="margin:0 0 4px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
                  YU.R Skin Solution
                </div>

                ${input.body}

              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
            ${esc(footer)}
          </p>
          ${
            input.legalLine
              ? `<p style="margin:6px 0 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.12em;color:#A8A29E;">
            ${esc(input.legalLine)}
          </p>`
              : ""
          }
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Table-based CTA button — the only reliable way to render a big filled
 * button in Outlook desktop. Use this when you need a single clear action.
 */
export function renderCtaButton(href: string, label: string): string {
  return /* html */ `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px 0;">
      <tr>
        <td style="background:#1A1A1A;">
          <a href="${esc(href)}"
             style="display:inline-block;padding:14px 26px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#FBF7EF;text-decoration:none;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Hairline rule used to separate sections inside the card. */
export const EMAIL_HR =
  '<hr style="border:none;border-top:1px solid rgba(26,26,26,0.08);margin:28px 0 20px 0;" />';
