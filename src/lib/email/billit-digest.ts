// ─────────────────────────────────────────────────────────────────────────
// Billit reconciliation digest email — internal to ADMIN_NOTIFICATION_EMAIL.
//
// Called from /api/cron/billit-reconcile after the sweep completes.
// Renders one daily email summarising the night's reconciliation work:
//
//   · "All clear" headline when zero issues — acts as a daily heartbeat
//     (no email = something silenced the cron, which itself is a signal).
//   · "Action needed" headline + per-issue sections when there's anything
//     to flag.
//
// Sent EVEN when there's nothing to report, because in compliance-coded
// work the absence of a daily heartbeat is more informative than its
// presence. Low-stock alerts can no-op silently (a marketing nicety);
// Billit reconciliation can't.
//
// English-only (internal).
// ─────────────────────────────────────────────────────────────────────────

import {
  adminNotificationEmail,
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderEmailShell } from "./html";
import type {
  DigestRow,
  SweepReport,
} from "@/lib/invoices/billit/reconcile-sweep";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

export type BillitDigestEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Pure render. Caller decides whether to send. Returns null only when
 * configured=false (Billit not wired up yet, so no daily email needed).
 */
export function buildBillitDigestEmail(
  report: SweepReport,
): BillitDigestEmail | null {
  if (!report.configured) return null;

  const totalProblems = report.mismatches.length + report.stuckFailures.length;
  const dashboardUrl = `${siteUrl()}/admin/billit`;

  const subject =
    totalProblems === 0
      ? `Billit · all clear (${report.newlyPushed} pushed today)`
      : `Billit · ${totalProblems} ${
          totalProblems === 1 ? "row needs" : "rows need"
        } attention`;

  const summary = renderSummary(report);
  const mismatches = report.mismatches.length
    ? renderProblemSection(
        "Mismatches",
        "These rows are in Billit, but our totals don't reconcile to the cent. The document is in their books — just verify the customer-facing PDF matches.",
        report.mismatches,
      )
    : "";
  const stuck = report.stuckFailures.length
    ? renderProblemSection(
        "Stuck failures",
        "These rows have exhausted automatic retries (5+ attempts). Most common cause: wrong PartyID for the environment, expired key, or a payload validation error. Review the error and retry manually from /admin/billit after fixing.",
        report.stuckFailures,
      )
    : "";

  const allClear =
    totalProblems === 0
      ? /* html */ `
        <div style="margin-top:24px;padding:16px 18px;border:1px solid rgba(16,185,129,0.3);background:rgba(16,185,129,0.06);">
          <div style="font-size:13px;color:#047857;font-weight:500;">All clear.</div>
          <div style="margin-top:4px;font-size:12px;color:#047857;opacity:0.85;">
            No mismatches or stuck failures in the last 90 days. This email is a
            heartbeat — if you stop receiving it, the cron has died.
          </div>
        </div>
      `
      : "";

  const cta = /* html */ `
    <div style="margin-top:28px;">
      <a href="${esc(dashboardUrl)}" style="display:inline-block;padding:11px 22px;background:#1A1A1A;color:#FAFAF7;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">
        Open Billit dashboard
      </a>
    </div>
  `;

  const body = /* html */ `
    <div style="font-size:13px;color:#1A1A1A;line-height:1.6;">
      <p style="margin:0 0 12px;">${esc(subject)}</p>
      ${summary}
      ${allClear}
      ${mismatches}
      ${stuck}
      ${cta}
      <p style="margin:32px 0 0;font-size:11px;color:#8A8A8A;">
        Daily reconciliation of our invoice + credit-note mirror in
        K&apos;Elmus&apos; Billit account. Source: <code>/admin/billit</code>.
      </p>
    </div>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader:
      totalProblems === 0
        ? `All quiet on the books · ${report.newlyPushed} pushed today.`
        : `${totalProblems} ${totalProblems === 1 ? "row needs" : "rows need"} your attention.`,
    body,
    lang: "en",
  });

  const text = buildPlainText(report, dashboardUrl);

  return { subject, html, text };
}

function renderSummary(report: SweepReport): string {
  return /* html */ `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#8A8A8A;">Newly pushed</td>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;text-align:right;font-variant-numeric:tabular-nums;">${report.newlyPushed}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#8A8A8A;">Retried this run</td>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;text-align:right;font-variant-numeric:tabular-nums;">${report.retried}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#8A8A8A;">Still pending (will retry tomorrow)</td>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;text-align:right;font-variant-numeric:tabular-nums;">${report.stillPending}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#8A8A8A;">Mismatches (90-day window)</td>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;text-align:right;font-variant-numeric:tabular-nums;">${report.mismatches.length}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:12px;color:#8A8A8A;">Stuck failures (90-day window)</td>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;text-align:right;font-variant-numeric:tabular-nums;">${report.stuckFailures.length}</td>
      </tr>
    </table>
  `;
}

function renderProblemSection(
  title: string,
  description: string,
  rows: DigestRow[],
): string {
  const rowHtml = rows
    .map(
      (r) => /* html */ `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid rgba(26,26,26,0.06);vertical-align:top;">
          <div style="font-family:'Courier New',monospace;font-size:12px;color:#1A1A1A;">${esc(r.number)}</div>
          <div style="margin-top:2px;font-size:11px;color:#8A8A8A;">
            ${r.kind === "invoice" ? "Invoice" : "Credit note"} ·
            ${r.issuedAt.toISOString().slice(0, 10)} ·
            €${r.ourGrandTotal.toFixed(2)}
          </div>
          ${
            r.errorMessage
              ? `<div style="margin-top:4px;font-size:11px;color:#B91C1C;">${esc(truncate(r.errorMessage, 220))}</div>`
              : ""
          }
        </td>
        <td style="padding:8px 0 8px 16px;border-bottom:1px solid rgba(26,26,26,0.06);text-align:right;vertical-align:top;font-size:11px;color:#8A8A8A;">
          ${r.attempts} ${r.attempts === 1 ? "attempt" : "attempts"}
        </td>
      </tr>
    `,
    )
    .join("");

  return /* html */ `
    <div style="margin-top:24px;">
      <div style="font-size:14px;color:#1A1A1A;font-weight:500;">${esc(title)} · ${rows.length}</div>
      <div style="margin-top:4px;font-size:12px;color:#8A8A8A;">${esc(description)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        ${rowHtml}
      </table>
    </div>
  `;
}

function buildPlainText(report: SweepReport, dashboardUrl: string): string {
  const lines: string[] = [];
  lines.push(`Billit daily reconciliation`);
  lines.push(``);
  lines.push(`Newly pushed:    ${report.newlyPushed}`);
  lines.push(`Retried:         ${report.retried}`);
  lines.push(`Still pending:   ${report.stillPending}`);
  lines.push(`Mismatches:      ${report.mismatches.length}`);
  lines.push(`Stuck failures:  ${report.stuckFailures.length}`);
  lines.push(``);

  if (report.mismatches.length) {
    lines.push(`MISMATCHES`);
    for (const r of report.mismatches) {
      lines.push(`  ${r.number} · €${r.ourGrandTotal.toFixed(2)} · ${r.errorMessage ?? ""}`);
    }
    lines.push(``);
  }
  if (report.stuckFailures.length) {
    lines.push(`STUCK FAILURES`);
    for (const r of report.stuckFailures) {
      lines.push(`  ${r.number} · €${r.ourGrandTotal.toFixed(2)} · ${r.errorMessage ?? ""}`);
    }
    lines.push(``);
  }
  if (report.mismatches.length + report.stuckFailures.length === 0) {
    lines.push(`All clear. This is the daily heartbeat.`);
  }

  lines.push(``);
  lines.push(`Dashboard: ${dashboardUrl}`);
  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Send the digest. No-op when the report says Billit isn't configured
 * (no point spamming "Billit not configured" emails before the env vars
 * land), or when ADMIN_NOTIFICATION_EMAIL is unset, or Resend is unset.
 */
export async function sendBillitDigest(report: SweepReport): Promise<{
  sent: boolean;
  reason?: string;
}> {
  if (!report.configured) {
    return { sent: false, reason: "billit-not-configured" };
  }

  const to = adminNotificationEmail();
  if (!to) {
    return { sent: false, reason: "admin-email-not-configured" };
  }

  const email = buildBillitDigestEmail(report);
  if (!email) {
    return { sent: false, reason: "no-email-to-build" };
  }

  const client = getResend();
  if (!client) {
    return { sent: false, reason: "resend-not-configured" };
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
        { name: "type", value: "billit_digest" },
        { name: "issues", value: String(report.mismatches.length + report.stuckFailures.length) },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error("[email] Resend send failed for Billit digest", err);
    return { sent: false, reason: "resend-send-failed" };
  }
}
