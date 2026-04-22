// ─────────────────────────────────────────────────────────────────────────
// Newsletter server action — double opt-in subscribe.
//
// Shape: (prevState, FormData) => NewsletterState — so the form can use
// React 19's useActionState and get typed errors/success back in the UI.
//
// Idempotency rules:
//   · Already confirmed → respond with a generic success message without
//     re-sending (avoid leaking membership + avoid email spam).
//   · Pending (unconfirmed) row exists → rotate the token and resend. The
//     user may simply have lost the first email.
//   · Previously unsubscribed → clear the unsubscribedAt flag and start a
//     fresh double-opt-in flow.
//   · New email → create a row and send the confirmation.
//
// The action never tells the caller which branch ran — the same success
// copy is returned across all valid paths. Only genuine errors (bad email,
// email-send failed) return ok:false.
//
// Locale: inferred from a hidden `locale` input that the homepage form
// fills from next-intl. Falls back to EN if somehow missing.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getResend, fromNewsletter, replyToAddress } from "@/lib/email/resend";
import { generateToken, hashToken } from "./tokens";
import { buildConfirmationEmail } from "./confirmation-email";

export type NewsletterState = {
  ok: boolean;
  message: string;
};

const InputSchema = z.object({
  email: z.string().email().max(254),
  locale: z.enum(["en", "nl", "fr", "ru"]).default("en"),
  source: z.string().max(40).optional(),
});

function toPrismaLocale(l: string): Locale {
  switch (l.toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}

/** Build the /api/newsletter/confirm absolute URL with the raw token. */
function confirmUrl(token: string): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${site}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

// ────────── subscribe action ───────────────────────────────────────────

export async function subscribeToNewsletterAction(
  _prev: NewsletterState | null,
  formData: FormData,
): Promise<NewsletterState> {
  const parsed = InputSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    locale: String(formData.get("locale") ?? "en").toLowerCase(),
    source: formData.get("source") ? String(formData.get("source")) : undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please enter a valid email address.",
    };
  }

  const { email, source } = parsed.data;
  const locale = toPrismaLocale(parsed.data.locale);

  // Generic success copy shown for every happy path. We don't want to
  // reveal whether the address is already on the list (GDPR + anti-phishing).
  const GENERIC_OK: NewsletterState = {
    ok: true,
    message: "Thank you — please check your inbox to confirm.",
  };

  // Find existing row (if any).
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { email },
  });

  // Already confirmed and active — silently succeed.
  if (existing?.confirmedAt && !existing.unsubscribedAt) {
    return GENERIC_OK;
  }

  // Decide whether we need to (re)send a confirmation email.
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);

  if (!existing) {
    await prisma.newsletterSubscriber.create({
      data: {
        email,
        locale,
        source: source ?? "homepage",
        tokenHash,
      },
    });
  } else {
    // Either pending (no confirmedAt) OR previously unsubscribed.
    // In both cases: refresh the locale/source (user might have changed
    // language), reset unsubscribedAt, and rotate the token.
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: {
        locale,
        source: source ?? existing.source ?? "homepage",
        tokenHash,
        // If they previously unsubscribed, we're treating this as a fresh
        // opt-in: clear both unsubscribedAt AND confirmedAt so they have
        // to re-confirm.
        confirmedAt: null,
        unsubscribedAt: null,
      },
    });
  }

  // ── send email ────────────────────────────────────────────────────
  const client = getResend();
  if (!client) {
    // Dev without a Resend key: log the confirm URL so we can still test
    // the flow locally without sending real email.
    console.warn(
      `[newsletter] RESEND_API_KEY not configured — confirm URL for ${email}: ${confirmUrl(
        rawToken,
      )}`,
    );
    return GENERIC_OK;
  }

  const { subject, html, text } = buildConfirmationEmail({
    confirmUrl: confirmUrl(rawToken),
    locale,
  });

  try {
    await client.emails.send({
      from: fromNewsletter(),
      to: email,
      subject,
      html,
      text,
      replyTo: replyToAddress(),
    });
  } catch (err) {
    console.error("[newsletter] Resend send failed", err);
    // Don't leak internals to the user, but flag the failure so they know
    // to try again rather than sitting on a silent "success".
    return {
      ok: false,
      message:
        "We couldn't send the confirmation email right now. Please try again in a moment.",
    };
  }

  return GENERIC_OK;
}
