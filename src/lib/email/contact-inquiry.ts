// ─────────────────────────────────────────────────────────────────────────
// Admin contact-inquiry notification — sent to ADMIN_NOTIFICATION_EMAIL
// whenever a customer submits /[locale]/contact.
//
// English-only (internal). The goal is that Sofia can reply straight from
// her normal inbox: we set Reply-To to the customer's address so "Reply"
// in Gmail/Outlook does the right thing without her opening the admin.
//
// Never throws — a failed send is logged but the DB row is always written.
// ─────────────────────────────────────────────────────────────────────────

import {
  adminNotificationEmail,
  fromTransactional,
  getResend,
} from "./resend";
import { esc, renderCtaButton, renderEmailShell } from "./html";
import { prisma } from "@/lib/prisma";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

const SUBJECT_LABEL: Record<string, string> = {
  GENERAL: "General enquiry",
  ORDER: "Order enquiry",
  RETURN: "Return / refund",
  WHOLESALE: "Wholesale / press",
  TECHNICAL: "Technical / account issue",
};

/**
 * Fetch the contact row and render an internal summary to Sofia.
 * Returns { sent, reason? }.
 */
export async function sendContactInquiryEmail(
  messageId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const to = adminNotificationEmail();
  if (!to) {
    console.warn(
      "[email] ADMIN_NOTIFICATION_EMAIL not configured — skipping contact inquiry alert",
    );
    return { sent: false, reason: "admin-email-not-configured" };
  }

  const msg = await prisma.contactMessage.findUnique({
    where: { id: messageId },
  });
  if (!msg) return { sent: false, reason: "message-not-found" };

  const subjectLabel = SUBJECT_LABEL[msg.subject] ?? msg.subject;
  const subject = `[Contact] ${subjectLabel} — ${msg.name}`;
  const adminUrl = `${siteUrl()}/admin/contact/${encodeURIComponent(msg.id)}`;

  // The meta block lists the known identifiers so Sofia doesn't have to
  // open the admin for the common case (read the message, reply straight
  // away via Gmail).
  const meta = /* html */ `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#8A8A8A;width:120px;">From</td>
        <td style="padding:4px 0;font-size:13px;color:#1A1A1A;">${esc(msg.name)} &lt;${esc(msg.email)}&gt;</td>
      </tr>
      ${
        msg.phone
          ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#8A8A8A;">Phone</td>
              <td style="padding:4px 0;font-size:13px;color:#1A1A1A;">${esc(msg.phone)}</td>
            </tr>`
          : ""
      }
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#8A8A8A;">Subject</td>
        <td style="padding:4px 0;font-size:13px;color:#1A1A1A;">${esc(subjectLabel)}</td>
      </tr>
      ${
        msg.orderNumber
          ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#8A8A8A;">Order ref</td>
              <td style="padding:4px 0;font-size:13px;color:#1A1A1A;">${esc(msg.orderNumber)}</td>
            </tr>`
          : ""
      }
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#8A8A8A;">Locale</td>
        <td style="padding:4px 0;font-size:13px;color:#1A1A1A;">${esc(msg.locale)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#8A8A8A;">Received</td>
        <td style="padding:4px 0;font-size:13px;color:#1A1A1A;">${esc(msg.createdAt.toISOString())}</td>
      </tr>
    </table>
  `;

  // Preserve the customer's line breaks but escape everything else.
  const messageHtml = esc(msg.message).replace(/\n/g, "<br />");

  const body = /* html */ `
    <h1 style="margin:24px 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:22px;line-height:1.3;color:#1A1A1A;">
      New contact message
    </h1>
    <p style="margin:0 0 20px 0;font-size:13px;color:#5E5751;">
      Hit <strong>Reply</strong> to answer ${esc(msg.name)} directly.
    </p>

    ${meta}

    <div style="margin:20px 0;border-top:1px solid #E5E3DE;"></div>

    <div style="font-size:14px;line-height:1.65;color:#1A1A1A;white-space:normal;">
      ${messageHtml}
    </div>

    <div style="margin:28px 0 0 0;">
      ${renderCtaButton(adminUrl, "Open in admin")}
    </div>
  `;

  const html = renderEmailShell({
    title: subject,
    preheader: `${msg.name} · ${subjectLabel}`,
    lang: "en",
    body,
    footerNote: "Internal notification · K'Elmus Group BV",
  });

  const text = [
    `New contact message · ${subjectLabel}`,
    "",
    `From: ${msg.name} <${msg.email}>`,
    msg.phone ? `Phone: ${msg.phone}` : "",
    msg.orderNumber ? `Order ref: ${msg.orderNumber}` : "",
    `Locale: ${msg.locale}`,
    `Received: ${msg.createdAt.toISOString()}`,
    "",
    "— message —",
    msg.message,
    "",
    `Open in admin: ${adminUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const client = getResend();
  if (!client) {
    console.warn(
      `[email] contact inquiry not sent (no RESEND_API_KEY) for ${msg.id}`,
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
      // Critical: Reply-To points at the customer so Sofia's "Reply" works.
      replyTo: msg.email,
      tags: [
        { name: "type", value: "contact_inquiry" },
        { name: "subject", value: msg.subject },
      ],
    });
    return { sent: true };
  } catch (err) {
    console.error(
      `[email] Resend send failed for contact inquiry ${msg.id}`,
      err,
    );
    return { sent: false, reason: "resend-send-failed" };
  }
}
