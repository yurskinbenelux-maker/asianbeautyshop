"use server";

// ─────────────────────────────────────────────────────────────────────────
// /admin/emails/actions.ts — server actions for the email-preview surface.
//
// The only action so far is "send a test copy of this template to my own
// inbox". We deliberately hard-code the recipient to the *current admin's*
// email (pulled from the Supabase session) rather than letting Sofia type
// an arbitrary destination — that way the preview page can never be used
// to spam someone else from our Resend domain.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { Locale } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "@/lib/email/resend";
import { getEmailTemplate, PREVIEW_LOCALES } from "./registry";

export type ActionState = {
  ok: boolean;
  message?: string;
};

const LOCALE_VALUES = PREVIEW_LOCALES.map((l) => l as string) as [
  string,
  ...string[],
];

const Schema = z.object({
  templateKey: z.string().min(1),
  locale: z.enum(LOCALE_VALUES),
});

export async function sendTestEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Auth — only admins may hit this.
  const user = await requireAdmin();
  const toAddress = user.email;
  if (!toAddress) {
    return {
      ok: false,
      message: "No email on your admin account — can't send the test.",
    };
  }

  const parsed = Schema.safeParse({
    templateKey: formData.get("templateKey"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Bad preview request." };
  }

  const template = getEmailTemplate(parsed.data.templateKey);
  if (!template) {
    return { ok: false, message: "Unknown template." };
  }

  // Render with the fixture at the requested locale.
  const rendered = template.render(parsed.data.locale as Locale);
  if (!rendered) {
    return {
      ok: false,
      message:
        "Template returned nothing for the current fixture — nothing to send.",
    };
  }

  const client = getResend();
  if (!client) {
    return {
      ok: false,
      message:
        "Resend is not configured (RESEND_API_KEY missing) — can't send. You can still preview the HTML above.",
    };
  }

  // Prefix the subject so the test copy is obvious in Sofia's inbox and
  // she doesn't mistake it for a real customer email.
  const subject = `[TEST · ${parsed.data.locale}] ${rendered.subject}`;

  try {
    await client.emails.send({
      from: fromTransactional(),
      to: toAddress,
      subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: replyToAddress(),
      tags: [
        { name: "type", value: "preview_test" },
        { name: "template", value: template.key },
        { name: "locale", value: parsed.data.locale },
      ],
    });
    return {
      ok: true,
      message: `Sent to ${toAddress}. Check your inbox in a few seconds.`,
    };
  } catch (err) {
    console.error("[admin/emails] test send failed", err);
    return {
      ok: false,
      message: "Resend rejected the send — check the server logs.",
    };
  }
}
