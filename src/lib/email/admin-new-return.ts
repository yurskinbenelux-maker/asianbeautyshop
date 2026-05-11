// ─────────────────────────────────────────────────────────────────────────
// Admin new-return notification — sent to admin@asianbeautyshop.eu the
// moment a customer submits a return via /account (future #93 flow) or
// one is created by an admin on their behalf.
//
// English-only (internal). Companion to admin-new-order.ts.  The goal is
// for an admin to glance at her inbox and know: which order, which customer,
// how many items, and — if the customer supplied one — the reason.
// The CTA links back into /admin/returns/<id>.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  adminNotificationEmail,
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";
import { formatEmailMoney, getOrderForEmail } from "./order-query";

export type AdminRmaContext = {
  /** The return DB id or reference used in the admin URL. */
  returnId: string;
  /** Public-facing reference shown in the subject line. */
  returnReference: string;
  /** Line items being returned. */
  items: Array<{ productName: string; quantity: number }>;
  /** Customer-supplied reason; an admin wants to see this at a glance. */
  reason?: string | null;
  /** Customer-supplied refund preference, if any. */
  refundPreference?: "money" | "replacement" | null;
};

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

export async function sendAdminNewReturnEmail(
  orderId: string,
  rma: AdminRmaContext,
): Promise<{ sent: boolean; reason?: string }> {
  const to = adminNotificationEmail();
  if (!to) {
    console.warn(
      "[email] ADMIN_NOTIFICATION_EMAIL not configured — skipping new-return alert",
    );
    return { sent: false, reason: "admin-email-not-configured" };
  }

  const order = await getOrderForEmail(orderId);
  if (!order) return { sent: false, reason: "order-not-found" };

  // Admin UI is English regardless of customer locale.
  const money = (n: number) => formatEmailMoney(n, order.currency, Locale.EN);

  const fullName = [
    order.shippingAddress?.firstName,
    order.shippingAddress?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const itemCount = rma.items.reduce((sum, it) => sum + it.quantity, 0);

  const subject = `Return request · ${rma.returnReference} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ${fullName || order.email}`;

  const adminUrl = `${siteUrl()}/admin/returns/${encodeURIComponent(rma.returnId)}`;

  const itemRows = rma.items
    .slice(0, 8)
    .map(
      (it) => /* html */ `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;">${esc(it.productName)}</td>
        <td align="right" style="padding:6px 0 6px 12px;font-size:13px;color:#5E5751;white-space:nowrap;">× ${it.quantity}</td>
      </tr>`,
    )
    .join("");

  const moreLine =
    rma.items.length > 8
      ? `<p style="margin:8px 0 0 0;font-size:12px;color:#8A8A8A;">+ ${rma.items.length - 8} more line(s)</p>`
      : "";

  const reasonBlock = rma.reason
    ? /* html */ `
      <div style="margin:24px 0 8px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8A8A8A;">
        Customer reason
      </div>
      <blockquote style="margin:0 0 24px 0;padding:12px 14px;background:#F3EDE3;border-left:3px solid rgba(26,26,26,0.2);font-size:14px;line-height:1.6;color:#1A1A1A;white-space:pre-wrap;">${esc(rma.reason)}</blockquote>
    `
    : "";

  const prefBlock = rma.refundPreference
    ? /* html */ `
      <p style="margin:0 0 20px 0;font-size:13px;color:#5E5751;">
        Refund preference: <strong>${esc(rma.refundPreference)}</strong>
      </p>
    `
    : "";

  const body = /* html */ `
    <h1 style="margin:24px 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:22px;line-height:1.3;color:#1A1A1A;">
      Return request · ${esc(rma.returnReference)}
    </h1>

    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      <strong style="font-weight:500;">${esc(fullName || order.email)}</strong>
      &nbsp;·&nbsp; Order ${esc(order.publicNumber)}
      &nbsp;·&nbsp; ${itemCount} item${itemCount === 1 ? "" : "s"}
      &nbsp;·&nbsp; ${esc(money(order.grandTotal))} order total
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      ${itemRows}
    </table>
    ${moreLine}

    ${reasonBlock}
    ${prefBlock}

    <div style="margin:20px 0 0 0;">
      ${renderCtaButton(adminUrl, "Open in admin")}
    </div>

    <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#8A8A8A;">
      Customer: ${esc(order.email)}<br />
      Locale: ${esc(order.locale)}<br />
      Order placed: ${esc(order.placedAt.toISOString())}
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: `${rma.returnReference} · ${fullName || order.email} · ${itemCount} item${itemCount === 1 ? "" : "s"}`,
    lang: "en",
    body,
    footerNote: "Internal notification · K'Elmus Group BV",
  });

  const text = [
    `Return request · ${rma.returnReference}`,
    "",
    `${fullName || order.email} · Order ${order.publicNumber} · ${itemCount} item(s) · ${money(order.grandTotal)} order total`,
    "",
    ...rma.items.slice(0, 8).map((it) => `  ${it.productName} × ${it.quantity}`),
    rma.items.length > 8 ? `  + ${rma.items.length - 8} more` : "",
    "",
    rma.reason ? `Customer reason: ${rma.reason}` : "",
    rma.refundPreference ? `Refund preference: ${rma.refundPreference}` : "",
    "",
    `Open in admin: ${adminUrl}`,
    "",
    `Customer: ${order.email}`,
    `Locale: ${order.locale}`,
    `Order placed: ${order.placedAt.toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] admin new-return alert not sent (no RESEND_API_KEY) for ${order.publicNumber} / ${rma.returnReference}`,
    );
    return { sent: false, reason: "resend-not-configured" };
  }

  try {
    await client.emails.send({
      from: fromTransactional(),
      to,
      subject,
      html,
      text,
      replyTo: replyToAddress(),
      tags: [
        { name: "type", value: "admin_new_return" },
        { name: "order", value: order.publicNumber },
        { name: "return", value: rma.returnReference },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for admin new-return ${order.publicNumber} / ${rma.returnReference}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
