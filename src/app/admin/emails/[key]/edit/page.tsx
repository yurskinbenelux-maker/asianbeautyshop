// ─────────────────────────────────────────────────────────────────────────
// /admin/emails/[key]/edit — per-locale email copy editor.
//
// Server component: fetches all defaults + every existing override row
// for this email, hands the merged data to <EmailCopyEditor> client
// component. The editor surfaces:
//   · One textarea per editable field, repeated 4× (EN/NL/FR/RU)
//   · DeepL "translate to other 3 locales" button (EN tab only)
//   · Groq "polish" button per field
//   · Reset-to-default button per field
//   · Live preview iframe
//   · Warning banner about dynamic fields
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Locale } from "@prisma/client";

import { requireCapability } from "@/lib/auth-roles";
import { getEmailTemplate } from "../../registry";
import { getFieldMeta, getDefaultStrings } from "../../field-meta";
import { getAllOverridesByLocale } from "@/lib/email/copy-overrides";
import { EmailCopyEditor } from "@/components/admin/emails/copy-editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }> };

export default async function EmailEditPage({ params }: Props) {
  await requireCapability("emails.send", "/admin/emails");
  const { key } = await params;

  const template = getEmailTemplate(key);
  const fieldMeta = getFieldMeta(key);
  if (!template || !fieldMeta) notFound();

  const [defaults, overrides] = await Promise.all([
    getDefaultStrings(key),
    getAllOverridesByLocale(key),
  ]);
  if (!defaults) notFound();

  // Convert Map → plain object for the client component (Maps don't
  // serialize across the RSC boundary).
  const overrideRecords: Record<Locale, Record<string, string>> = {
    [Locale.EN]: Object.fromEntries(overrides.EN),
    [Locale.NL]: Object.fromEntries(overrides.NL),
    [Locale.FR]: Object.fromEntries(overrides.FR),
    [Locale.RU]: Object.fromEntries(overrides.RU),
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <Link
        href={`/admin/emails/${key}`}
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to preview
      </Link>

      <header className="mt-6 border-b border-ink/10 pb-6">
        <div className="eyebrow">Edit copy</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {template.label}
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
          Tweak the per-locale copy below. Empty fields fall back to the
          built-in defaults — clearing a textarea reverts that field.
        </p>
      </header>

      <EmailCopyEditor
        emailKey={key}
        templateLabel={template.label}
        fieldMeta={fieldMeta}
        defaults={defaults}
        initialOverrides={overrideRecords}
      />
    </div>
  );
}
