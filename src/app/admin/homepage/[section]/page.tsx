// ─────────────────────────────────────────────────────────────────────────
// /admin/homepage/[section] — edit every field × every locale for one
// homepage/editorial section (e.g. "home.hero", "footer").
//
// Server component: loads existing rows from SiteCopy and the JSON fallback
// catalogues (used as placeholder text in the form), then renders the
// client-side form. The form submits to saveSectionAction.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Locale } from "@prisma/client";
import {
  SITE_COPY_SCHEMA,
  SITE_COPY_SECTION_LABELS,
  SITE_COPY_FIELD_LABELS,
  SITE_COPY_VOID,
  listSiteCopyRows,
  jsonFallback,
  type SiteCopySection,
} from "@/lib/queries/site-copy";
import { SectionCopyForm } from "@/components/admin/homepage/section-copy-form";

// The four message catalogues — imported as static JSON so we can show the
// current fallback text as a placeholder without a runtime fetch.
import enMessages from "../../../../../messages/en.json";
import nlMessages from "../../../../../messages/nl.json";
import frMessages from "../../../../../messages/fr.json";
import ruMessages from "../../../../../messages/ru.json";

export const dynamic = "force-dynamic";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

const MESSAGES_BY_LOCALE: Record<Locale, Record<string, unknown>> = {
  EN: enMessages as Record<string, unknown>,
  NL: nlMessages as Record<string, unknown>,
  FR: frMessages as Record<string, unknown>,
  RU: ruMessages as Record<string, unknown>,
};

function isSection(value: string): value is SiteCopySection {
  return value in SITE_COPY_SCHEMA;
}

export default async function EditSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: raw } = await params;
  const section = decodeURIComponent(raw);
  if (!isSection(section)) notFound();

  const rows = await listSiteCopyRows(section);
  const fields = SITE_COPY_SCHEMA[section] as readonly string[];

  // Shape the data the form component wants:
  //   fields: [{ field, label, fallbackByLocale, valueByLocale }, …]
  const fieldData = fields.map((field) => {
    const fallbackByLocale: Record<Locale, string> = {
      EN: jsonFallback(MESSAGES_BY_LOCALE.EN, section, field) ?? "",
      NL: jsonFallback(MESSAGES_BY_LOCALE.NL, section, field) ?? "",
      FR: jsonFallback(MESSAGES_BY_LOCALE.FR, section, field) ?? "",
      RU: jsonFallback(MESSAGES_BY_LOCALE.RU, section, field) ?? "",
    };
    const valueByLocale: Record<Locale, string> = {
      EN: "",
      NL: "",
      FR: "",
      RU: "",
    };
    for (const r of rows) {
      if (r.field === field) valueByLocale[r.locale] = r.value;
    }
    // A field is "voided" when its EN row carries the sentinel — we
    // always write the sentinel to all 4 locales together, but checking
    // EN alone is enough to render the right state in the form.
    const voided = valueByLocale.EN === SITE_COPY_VOID;
    // When voided, blank out the per-locale text values in the form so
    // Sofia doesn't see "__SITE_COPY_VOID__" in the inputs.
    const visibleValueByLocale: Record<Locale, string> = voided
      ? { EN: "", NL: "", FR: "", RU: "" }
      : valueByLocale;
    return {
      field,
      label: SITE_COPY_FIELD_LABELS[field] ?? field,
      fallbackByLocale,
      valueByLocale: visibleValueByLocale,
      voided,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href="/admin/homepage"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Website copy
      </Link>

      <header className="mb-10 mt-6">
        <div className="eyebrow">Edit section</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {SITE_COPY_SECTION_LABELS[section]}
        </h1>
        <p className="mt-2 font-mono text-[11px] tracking-label text-ink-mid">
          {section}
        </p>
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-mid">
          Each field below has one box per language. Leave a box empty to use
          the default text we ship with the site — you don't need to fill in
          every language to publish.
        </p>
      </header>

      <SectionCopyForm
        section={section}
        fields={fieldData}
        locales={LOCALES}
      />
    </div>
  );
}
