"use server";

// ─────────────────────────────────────────────────────────────────────────
// /admin/emails/actions.ts — server actions for the email-preview surface.
//
//   sendTestEmailAction — fire one copy at the current admin's address
//   saveEmailOverrideAction — upsert an override row for one (key,locale,field)
//   resetEmailOverrideAction — delete one override row (revert to default)
//   translateEmailFieldAction — DeepL: translate a value into the other 3 locales
//   polishEmailFieldAction — Groq: rewrite a value to be more polished
//
// All actions require admin + the `emails.send` capability so only owners
// can edit transactional copy.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Locale } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import {
  fromTransactional,
  getResend,
  replyToAddress,
} from "@/lib/email/resend";
import { translateBatch } from "@/lib/translate/deepl";
import { polishEmailText } from "@/lib/ai/polish-email-text";
import { getEmailTemplate, PREVIEW_LOCALES } from "./registry";
import { getFieldMeta } from "./field-meta";

export type ActionState = {
  ok: boolean;
  message?: string;
};

// Specialised return types — the translate/polish actions mutate state
// the editor needs to reflect locally (the values they just wrote to
// the DB). Returning them here saves a `router.refresh()` round-trip
// and lets the client UI update instantly.
export type TranslateActionState = ActionState & {
  /** Map of target locale → translated value, set on success. */
  translations?: Partial<Record<Locale, string>>;
};
export type PolishActionState = ActionState & {
  /** The Groq-polished value that was saved as the override. */
  polishedValue?: string;
};

const LOCALE_VALUES = PREVIEW_LOCALES.map((l) => l as string) as [
  string,
  ...string[],
];

// ─────────────────────────────────────────────────────────────────────────
// Test send (unchanged)
// ─────────────────────────────────────────────────────────────────────────

const TestSendSchema = z.object({
  templateKey: z.string().min(1),
  locale: z.enum(LOCALE_VALUES),
});

// ─────────────────────────────────────────────────────────────────────────
// Live preview — called by the editor on every (debounced) keystroke so
// an admin can see her edits render in the iframe without saving first.
// Takes the editor's in-memory draft state (a flat Record because Map
// doesn't serialize across the RSC boundary) and renders the HTML.
// Pure read operation — no DB writes, no auth side-effects beyond the
// admin gate.
// ─────────────────────────────────────────────────────────────────────────

export async function previewEmailAction(input: {
  emailKey: string;
  locale: string;
  /** Draft override values keyed by fieldKey. Empty strings = "use default". */
  overrides: Record<string, string>;
}): Promise<{ ok: true; subject: string; html: string } | { ok: false }> {
  await requireCapability("emails.send", "/admin/emails");

  if (!LOCALE_VALUES.includes(input.locale)) return { ok: false };
  const template = getEmailTemplate(input.emailKey);
  if (!template) return { ok: false };

  // Build a Map<fieldKey, value> filtering out empties — the merger
  // already ignores empties but doing it here keeps the contract
  // explicit: "no key in the Map means no override for that field".
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(input.overrides)) {
    if (typeof v === "string" && v.trim().length > 0) {
      map.set(k, v);
    }
  }

  const rendered = template.render(input.locale as Locale, map);
  if (!rendered) return { ok: false };
  return { ok: true, subject: rendered.subject, html: rendered.html };
}

export async function sendTestEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const toAddress = user.email;
  if (!toAddress) {
    return {
      ok: false,
      message: "No email on your admin account — can't send the test.",
    };
  }

  const parsed = TestSendSchema.safeParse({
    templateKey: formData.get("templateKey"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { ok: false, message: "Bad preview request." };

  const template = getEmailTemplate(parsed.data.templateKey);
  if (!template) return { ok: false, message: "Unknown template." };

  const rendered = template.render(parsed.data.locale as Locale);
  if (!rendered) {
    return {
      ok: false,
      message: "Template returned nothing — nothing to send.",
    };
  }

  const client = getResend();
  if (!client) {
    return {
      ok: false,
      message: "Resend not configured — set RESEND_API_KEY first.",
    };
  }

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
    return { ok: true, message: `Sent to ${toAddress}.` };
  } catch (err) {
    console.error("[admin/emails] test send failed", err);
    return { ok: false, message: "Resend rejected the send." };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Save override — upsert one (emailKey, locale, fieldKey) row.
// Empty values delete the row (revert-to-default is the same as save-empty).
// ─────────────────────────────────────────────────────────────────────────

const SaveSchema = z.object({
  emailKey: z.string().min(1),
  locale: z.enum(LOCALE_VALUES),
  fieldKey: z.string().min(1),
  value: z.string().max(2000),
});

export async function saveEmailOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireCapability("emails.send", "/admin/emails");

  const parsed = SaveSchema.safeParse({
    emailKey: formData.get("emailKey"),
    locale: formData.get("locale"),
    fieldKey: formData.get("fieldKey"),
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "Invalid field." };

  // Guard: refuse to save overrides for fields the meta says are dynamic.
  const meta = getFieldMeta(parsed.data.emailKey);
  const field = meta?.find((f) => f.key === parsed.data.fieldKey);
  if (!field) return { ok: false, message: "Unknown field." };
  if (field.kind === "dynamic") {
    return {
      ok: false,
      message: `"${field.label}" contains dynamic placeholders and can't be edited from admin — change it in the email's TS file.`,
    };
  }

  const trimmed = parsed.data.value.trim();
  const locale = parsed.data.locale as Locale;

  if (trimmed.length === 0) {
    // Empty save = revert to default
    await prisma.emailCopyOverride.deleteMany({
      where: {
        emailKey: parsed.data.emailKey,
        locale,
        fieldKey: parsed.data.fieldKey,
      },
    });
  } else {
    await prisma.emailCopyOverride.upsert({
      where: {
        emailKey_locale_fieldKey: {
          emailKey: parsed.data.emailKey,
          locale,
          fieldKey: parsed.data.fieldKey,
        },
      },
      create: {
        emailKey: parsed.data.emailKey,
        locale,
        fieldKey: parsed.data.fieldKey,
        value: parsed.data.value,
        updatedBy: ctx.user.id,
      },
      update: {
        value: parsed.data.value,
        updatedBy: ctx.user.id,
      },
    });
  }

  revalidatePath(`/admin/emails/${parsed.data.emailKey}/edit`);
  revalidatePath(`/admin/emails/${parsed.data.emailKey}`);
  return { ok: true, message: "Saved." };
}

// ─────────────────────────────────────────────────────────────────────────
// Reset — delete one override row for one (locale, field).
// ─────────────────────────────────────────────────────────────────────────

export async function resetEmailOverrideAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCapability("emails.send", "/admin/emails");

  const emailKey = String(formData.get("emailKey") ?? "");
  const localeStr = String(formData.get("locale") ?? "");
  const fieldKey = String(formData.get("fieldKey") ?? "");

  if (!emailKey || !fieldKey || !LOCALE_VALUES.includes(localeStr)) {
    return { ok: false, message: "Bad request." };
  }

  await prisma.emailCopyOverride.deleteMany({
    where: { emailKey, locale: localeStr as Locale, fieldKey },
  });
  revalidatePath(`/admin/emails/${emailKey}/edit`);
  return { ok: true, message: "Reset to default." };
}

// ─────────────────────────────────────────────────────────────────────────
// DeepL translate — given a source value + source locale, translate it
// into the OTHER three locales and upsert each as an override.
// an admin uses this when she tweaks the EN copy and wants the same tweak
// reflected in NL/FR/RU without re-typing.
// ─────────────────────────────────────────────────────────────────────────

// DeepL translates from English only (per the existing translateBatch
// wrapper). The editor surfaces this button only on the EN tab; the
// action enforces the same constraint server-side.
const TranslateSchema = z.object({
  emailKey: z.string().min(1),
  fieldKey: z.string().min(1),
  value: z.string().min(1).max(2000),
});

export async function translateEmailFieldAction(
  _prev: TranslateActionState,
  formData: FormData,
): Promise<TranslateActionState> {
  const ctx = await requireCapability("emails.send", "/admin/emails");
  const parsed = TranslateSchema.safeParse({
    emailKey: formData.get("emailKey"),
    fieldKey: formData.get("fieldKey"),
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "Nothing to translate." };

  const meta = getFieldMeta(parsed.data.emailKey);
  const field = meta?.find((f) => f.key === parsed.data.fieldKey);
  if (!field || field.kind === "dynamic") {
    return { ok: false, message: "This field can't be auto-translated." };
  }

  const targets: Locale[] = [Locale.NL, Locale.FR, Locale.RU];

  try {
    // One DeepL call per target. Wrapped translateBatch is EN-source only.
    const results = await Promise.all(
      targets.map(async (target) => {
        const out = await translateBatch([parsed.data.value], { target });
        if (!out.ok) {
          throw new Error(`DeepL ${out.error.kind}`);
        }
        return { target, value: out.translations[0] ?? "" };
      }),
    );
    // Save each translation as an override AND collect the values to
    // ship back to the client so the editor can merge them into local
    // state without a full page refresh.
    const translations: Partial<Record<Locale, string>> = {};
    await Promise.all(
      results.map(async ({ target, value }) => {
        if (!value || !value.trim()) return;
        translations[target] = value;
        await prisma.emailCopyOverride.upsert({
          where: {
            emailKey_locale_fieldKey: {
              emailKey: parsed.data.emailKey,
              locale: target,
              fieldKey: parsed.data.fieldKey,
            },
          },
          create: {
            emailKey: parsed.data.emailKey,
            locale: target,
            fieldKey: parsed.data.fieldKey,
            value,
            updatedBy: ctx.user.id,
          },
          update: { value, updatedBy: ctx.user.id },
        });
      }),
    );
    revalidatePath(`/admin/emails/${parsed.data.emailKey}/edit`);
    return {
      ok: true,
      message: `Translated to NL, FR, RU.`,
      translations,
    };
  } catch (err) {
    console.error("[admin/emails] DeepL translate failed", err);
    return {
      ok: false,
      message: "DeepL rejected the request — check DEEPL_API_KEY.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Groq polish — feed the value into the polish helper, save the result
// as an override for the SAME locale.
// ─────────────────────────────────────────────────────────────────────────

const PolishSchema = z.object({
  emailKey: z.string().min(1),
  locale: z.enum(LOCALE_VALUES),
  fieldKey: z.string().min(1),
  value: z.string().min(1).max(2000),
});

export async function polishEmailFieldAction(
  _prev: PolishActionState,
  formData: FormData,
): Promise<PolishActionState> {
  const ctx = await requireCapability("emails.send", "/admin/emails");
  const parsed = PolishSchema.safeParse({
    emailKey: formData.get("emailKey"),
    locale: formData.get("locale"),
    fieldKey: formData.get("fieldKey"),
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "Nothing to polish." };

  const meta = getFieldMeta(parsed.data.emailKey);
  const field = meta?.find((f) => f.key === parsed.data.fieldKey);
  if (!field || field.kind === "dynamic") {
    return { ok: false, message: "This field can't be auto-polished." };
  }

  try {
    const polished = await polishEmailText({
      locale: parsed.data.locale as Locale,
      fieldLabel: field.label,
      current: parsed.data.value,
    });
    if (!polished || !polished.trim()) {
      return { ok: false, message: "Groq returned an empty result." };
    }
    await prisma.emailCopyOverride.upsert({
      where: {
        emailKey_locale_fieldKey: {
          emailKey: parsed.data.emailKey,
          locale: parsed.data.locale as Locale,
          fieldKey: parsed.data.fieldKey,
        },
      },
      create: {
        emailKey: parsed.data.emailKey,
        locale: parsed.data.locale as Locale,
        fieldKey: parsed.data.fieldKey,
        value: polished,
        updatedBy: ctx.user.id,
      },
      update: { value: polished, updatedBy: ctx.user.id },
    });
    revalidatePath(`/admin/emails/${parsed.data.emailKey}/edit`);
    // Ship the polished text back so the editor can drop it straight
    // into the textarea — otherwise an admin clicks "Polish" and nothing
    // visible happens until she navigates away and back.
    return { ok: true, message: "Polished.", polishedValue: polished };
  } catch (err) {
    console.error("[admin/emails] Groq polish failed", err);
    return {
      ok: false,
      message: "Groq rejected the request — check GROQ_API_KEY.",
    };
  }
}
