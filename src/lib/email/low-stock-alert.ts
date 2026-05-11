// ─────────────────────────────────────────────────────────────────────────
// Low-stock alert email — internal digest to ADMIN_NOTIFICATION_EMAIL.
//
// Called from the daily cron (`/api/cron/low-stock`). Renders one email
// with every SKU currently at or below the threshold, ordered by scarcity.
// English-only (internal).
//
// Silently no-ops if the report is empty — we don't want an admin getting
// "All fine" emails every morning.
// ─────────────────────────────────────────────────────────────────────────

import {
  adminNotificationEmail,
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";
import type { LowStockReport } from "@/lib/queries/low-stock";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

export type LowStockEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Render the low-stock digest. Pure — caller decides whether to actually
 * send. Returns null if nothing to report.
 */
export function buildLowStockEmail(report: LowStockReport): LowStockEmail | null {
  if (report.rows.length === 0) return null;

  const count = report.rows.length;
  const subject =
    count === 1
      ? `Low stock · 1 SKU needs attention`
      : `Low stock · ${count} SKUs need attention`;

  // Table of low-stock items. One row per variant. The product name is the
  // main column; SKU sits below it in muted type; stock + variant label on
  // the right.
  const itemRows = report.rows
    .map(
      (row) => /* html */ `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(26,26,26,0.06);">
          <div style="font-size:14px;color:#1A1A1A;">
            <a href="${esc(row.adminUrl)}" style="color:#1A1A1A;text-decoration:none;">
              ${esc(row.productName)}
            </a>
          </div>
          <div style="margin-top:2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:#8A8A8A;">
            ${esc(row.variantLabel)} · ${esc(row.sku)}
          </div>
        </td>
        <td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid rgba(26,26,26,0.06);white-space:nowrap;">
          <span style="display:inline-block;padding:3px 8px;background:${row.stock === 0 ? "#E23B2F" : "#F3EDE3"};color:${row.stock === 0 ? "#FFFFFF" : "#1A1A1A"};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.04em;">
            ${row.stock} left
          </span>
        </td>
      </tr>`,
    )
    .join("");

  const body = /* html */ `
    <h1 style="margin:24px 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:22px;line-height:1.3;color:#1A1A1A;">
      Low stock
    </h1>

    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.65;color:#5E5751;">
      ${count === 1 ? "1 SKU is" : `${count} SKUs are`} at or below the threshold of ${report.threshold}.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px solid rgba(26,26,26,0.06);">
      ${itemRows}
    </table>

    <div style="margin:24px 0 0 0;">
      ${renderCtaButton(`${siteUrl()}/admin/products`, "Open products")}
    </div>

    <p style="margin:18px 0 0 0;font-size:12px;line-height:1.6;color:#8A8A8A;">
      Adjust the threshold in Admin → Settings → Inventory (key
      <code style="font-family:'SF Mono',Menlo,monospace;">inventory.lowStockThreshold</code>).
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: `${count} SKU${count === 1 ? "" : "s"} at or below ${report.threshold}`,
    lang: "en",
    body,
    footerNote: "Internal notification · K'Elmus Group BV",
  });

  const text = [
    subject,
    "",
    `${count === 1 ? "1 SKU is" : `${count} SKUs are`} at or below the threshold of ${report.threshold}.`,
    "",
    ...report.rows.map(
      (r) =>
        `  ${r.productName} — ${r.variantLabel} (${r.sku}): ${r.stock} left`,
    ),
    "",
    `Open products: ${siteUrl()}/admin/products`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Fetch report → render → send to admin inbox. Returns diagnostic info
 * so the cron route can log what happened.
 *
 * Never throws. Empty report = nothing sent (not a failure).
 */
export async function sendLowStockAlert(report: LowStockReport): Promise<{
  sent: boolean;
  reason?: string;
  count: number;
}> {
  const count = report.rows.length;
  if (count === 0) {
    return { sent: false, reason: "nothing-to-report", count: 0 };
  }

  const to = adminNotificationEmail();
  if (!to) {
    return { sent: false, reason: "admin-email-not-configured", count };
  }

  const email = buildLowStockEmail(report);
  if (!email) {
    return { sent: false, reason: "empty-email", count };
  }

  const client = getResend();
  if (!client) {
    return { sent: false, reason: "resend-not-configured", count };
  }

  try {
    await client.emails.send({
      from: fromTransactional(),
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: replyToAddress(),
      tags: [
        { name: "type", value: "low_stock_alert" },
        { name: "count", value: String(count) },
      ],
    });
    return { sent: true, count };
  } catch (err) {
    console.error("[email] Resend send failed for low-stock alert", err);
    return { sent: false, reason: "resend-send-failed", count };
  }
}
