// ─────────────────────────────────────────────────────────────────────────
// Admin new-order notification — sent to admin@asianbeautyshop.eu the
// moment an order flips to PAID.
//
// English-only (internal). Minimal chrome, maximum skimability — the goal
// is to let Sofia glance at her inbox and know a real customer paid for a
// real order, without having to open the admin panel.
//
// Unlike the customer confirmation, this one uses fromNewsletter() on
// purpose? No — it uses the same transactional sender (donotreply@) with
// Reply-To hello@, so Sofia can reply to discuss the order and the thread
// stays with the human inbox.
// ─────────────────────────────────────────────────────────────────────────

import {
  adminNotificationEmail,
  fromTransactional,
  getResend,
  replyToAddress,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";
import { formatEmailMoney, getOrderForEmail } from "./order-query";
import { Locale } from "@prisma/client";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

/**
 * Fetch the order, render an internal-audience summary, send to
 * ADMIN_NOTIFICATION_EMAIL. Never throws.
 */
export async function sendAdminNewOrderEmail(
  orderId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const to = adminNotificationEmail();
  if (!to) {
    console.warn(
      "[email] ADMIN_NOTIFICATION_EMAIL not configured — skipping new-order alert",
    );
    return { sent: false, reason: "admin-email-not-configured" };
  }

  const order = await getOrderForEmail(orderId);
  if (!order) {
    return { sent: false, reason: "order-not-found" };
  }

  // Force EN formatting — Sofia's admin panel is English regardless of
  // the customer's locale.
  const money = (n: number) => formatEmailMoney(n, order.currency, Locale.EN);

  const fullName = [
    order.shippingAddress?.firstName,
    order.shippingAddress?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const subject = `New order ${order.publicNumber} · ${money(order.grandTotal)} · ${fullName || order.email}`;

  const adminUrl = `${siteUrl()}/admin/orders/${encodeURIComponent(order.id)}`;

  // Item summary — one line per SKU, capped so Sofia's inbox preview
  // stays compact even for big carts.
  const itemList = order.items
    .slice(0, 6)
    .map(
      (it) => /* html */ `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;">${esc(it.productName)}</td>
        <td align="right" style="padding:6px 0 6px 12px;font-size:13px;color:#5E5751;white-space:nowrap;">× ${it.quantity}</td>
      </tr>`,
    )
    .join("");

  const moreLine =
    order.items.length > 6
      ? `<p style="margin:8px 0 0 0;font-size:12px;color:#8A8A8A;">+ ${order.items.length - 6} more line(s)</p>`
      : "";

  const body = /* html */ `
    <h1 style="margin:24px 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:22px;line-height:1.3;color:#1A1A1A;">
      New order · ${esc(order.publicNumber)}
    </h1>

    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.65;color:#1A1A1A;">
      <strong style="font-weight:500;">${esc(money(order.grandTotal))}</strong>
      &nbsp;·&nbsp; ${esc(fullName || order.email)}
      &nbsp;·&nbsp; ${order.itemCount} item${order.itemCount === 1 ? "" : "s"}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      ${itemList}
    </table>
    ${moreLine}

    <div style="margin:28px 0 0 0;">
      ${renderCtaButton(adminUrl, "Open in admin")}
    </div>

    <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#8A8A8A;">
      Customer: ${esc(order.email)}<br />
      Locale: ${esc(order.locale)}<br />
      Placed: ${esc(order.placedAt.toISOString())}
    </p>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: `${money(order.grandTotal)} · ${fullName || order.email}`,
    lang: "en",
    body,
    footerNote: "Internal notification · K'Elmus Group BV",
  });

  const text = [
    `New order · ${order.publicNumber}`,
    "",
    `${money(order.grandTotal)} · ${fullName || order.email} · ${order.itemCount} item(s)`,
    "",
    ...order.items
      .slice(0, 6)
      .map((it) => `  ${it.productName} × ${it.quantity}`),
    order.items.length > 6 ? `  + ${order.items.length - 6} more` : "",
    "",
    `Open in admin: ${adminUrl}`,
    "",
    `Customer: ${order.email}`,
    `Locale: ${order.locale}`,
    `Placed: ${order.placedAt.toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] admin new-order alert not sent (no RESEND_API_KEY) for ${order.publicNumber}`,
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
        { name: "type", value: "admin_new_order" },
        { name: "order", value: order.publicNumber },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for admin new-order ${order.publicNumber}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
