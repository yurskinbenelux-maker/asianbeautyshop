// ─────────────────────────────────────────────────────────────────────────
// /[locale]/contact — submission action.
//
// Shape: (prev, FormData) => ContactState, so the client form can use
// useActionState and get typed errors + success state back.
//
// What it does:
//   1. Validate (zod) — we're strict about email + honeypot so the DB stays
//      clean even if a spammer gets past the client-side required attrs.
//   2. Write a ContactMessage row (source of truth; never silently dropped
//      even if email delivery fails).
//   3. Fire-and-forget an admin notification through Resend so an admin sees
//      the enquiry in her inbox within seconds.
//
// Guest vs logged-in: if the submitter happens to be logged in we attach
// `userId` for easier lookup later. Guests are still recorded by email.
//
// Privacy: we hash the client IP (sha-256, truncated) — it's enough to
// spot abuse / rate-limit sources without storing a plain IP, matching
// the pattern already used by ConsentLog.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";

import { ContactStatus, ContactSubject, Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/auth";
import { sendContactInquiryEmail } from "@/lib/email/contact-inquiry";

// ────────── types exposed to the client form ───────────────────────────

export type ContactState = {
  ok: boolean;
  message: string;
  /** Field-level errors keyed by form field name, for inline display */
  fieldErrors?: Partial<Record<"name" | "email" | "message" | "subject", string>>;
  /** On success, echo the email so the confirmation screen can personalise */
  echo?: { name: string; email: string };
};

// ────────── input validation ───────────────────────────────────────────

const SUBJECTS = ["GENERAL", "ORDER", "RETURN", "WHOLESALE", "TECHNICAL"] as const;

const InputSchema = z.object({
  name: z.string().trim().min(2, "name_too_short").max(80, "name_too_long"),
  email: z.string().trim().toLowerCase().email("email_invalid").max(254),
  phone: z
    .string()
    .trim()
    .max(40, "phone_too_long")
    .optional()
    .transform((v) => (v ? v : undefined)),
  subject: z.enum(SUBJECTS).default("GENERAL"),
  orderNumber: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  message: z
    .string()
    .trim()
    .min(10, "message_too_short")
    .max(4000, "message_too_long"),
  locale: z.enum(["en", "nl", "fr", "ru"]).default("en"),
  /** Honeypot — must be empty. If a bot fills it we silently accept-then-drop. */
  website: z.string().max(0).optional().default(""),
  /** Required acknowledgement of the privacy policy. */
  consent: z.literal("on", { errorMap: () => ({ message: "consent_required" }) }),
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

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // Short hash — we just want to spot abusive bursts, not identify users.
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

// ────────── submit action ─────────────────────────────────────────────

export async function submitContactMessage(
  _prev: ContactState | null,
  formData: FormData,
): Promise<ContactState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: formData.get("phone") ? String(formData.get("phone")) : undefined,
    subject: String(formData.get("subject") ?? "GENERAL").toUpperCase(),
    orderNumber: formData.get("orderNumber")
      ? String(formData.get("orderNumber"))
      : undefined,
    message: String(formData.get("message") ?? ""),
    locale: String(formData.get("locale") ?? "en").toLowerCase(),
    website: String(formData.get("website") ?? ""),
    consent: String(formData.get("consent") ?? ""),
  };

  const parsed = InputSchema.safeParse(raw);

  if (!parsed.success) {
    // Map first issue per field into fieldErrors for inline display.
    const fieldErrors: ContactState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<ContactState["fieldErrors"]>;
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message: "validation_failed",
      fieldErrors,
    };
  }

  const data = parsed.data;

  // Honeypot triggered — pretend everything's fine so the bot moves on,
  // but don't persist or email.
  if (data.website && data.website.length > 0) {
    return {
      ok: true,
      message: "success",
      echo: { name: data.name, email: data.email },
    };
  }

  // Collect request metadata — best-effort only.
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const userAgent = h.get("user-agent") ?? null;

  // Attach to the logged-in user if there is one. Guests just leave userId null.
  const customer = await getCurrentCustomer().catch(() => null);
  const userId = customer?.profile.id ?? null;

  // 1 ── persist (this is the source of truth; never skip even if email fails)
  const created = await prisma.contactMessage.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      subject: data.subject as ContactSubject,
      orderNumber: data.orderNumber ?? null,
      message: data.message,
      locale: toPrismaLocale(data.locale),
      status: ContactStatus.NEW,
      ipHash: hashIp(ip),
      userAgent,
      userId,
    },
  });

  // 2 ── notify an admin — never block the user on this; log and continue.
  try {
    const outcome = await sendContactInquiryEmail(created.id);
    if (outcome.sent) {
      await prisma.contactMessage.update({
        where: { id: created.id },
        data: { notifiedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[contact] admin notification failed", err);
  }

  return {
    ok: true,
    message: "success",
    echo: { name: data.name, email: data.email },
  };
}
