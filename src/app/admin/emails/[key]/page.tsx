// ─────────────────────────────────────────────────────────────────────────
// /admin/emails/[key] — single-template preview.
//
// Renders the chosen template via its pure builder with a frozen fixture,
// then drops the HTML into an iframe srcDoc. The iframe gives us email-
// client-like isolation — the template's inline styles don't leak into
// the admin chrome.
//
// Locale selector is URL-driven (?lang=nl) so the preview is bookmarkable
// and the browser's back button does the right thing.
//
// "Send test to my inbox" uses the server action from ../actions.ts — the
// recipient is always the current admin's email, so the page can't be
// abused to send to strangers.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import { getEmailTemplate, PREVIEW_LOCALES } from "../registry";
import { hasEditableCopy } from "../field-meta";
import { TestSendForm } from "@/components/admin/emails/test-send-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ key: string }>;
type Search = Promise<{ lang?: string }>;

const LANG_BY_PARAM: Record<string, Locale> = {
  en: Locale.EN,
  nl: Locale.NL,
  fr: Locale.FR,
  ru: Locale.RU,
};

export default async function EmailPreviewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { key } = await params;
  const { lang } = await searchParams;

  const template = getEmailTemplate(key);
  if (!template) notFound();

  // Pick the locale. Non-localised templates always render EN.
  const locale: Locale = template.localised
    ? (LANG_BY_PARAM[(lang ?? "en").toLowerCase()] ?? Locale.EN)
    : Locale.EN;

  const rendered = template.render(locale);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      {/* back link */}
      <Link
        href="/admin/emails"
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All emails
      </Link>

      {/* masthead */}
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <div className="eyebrow">Preview</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            {template.label}
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            {template.description}
          </p>
        </div>
        {/* Edit-copy link — only shown when the email is registered in
            FIELD_META as having editable fields. Click takes Sofia to
            the per-locale editor with DeepL + Groq buttons. */}
        {hasEditableCopy(template.key) && (
          <Link
            href={`/admin/emails/${template.key}/edit`}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-rice transition-opacity hover:opacity-90"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit copy
          </Link>
        )}
      </header>

      {/* locale switcher ─ hidden for EN-only templates */}
      {template.localised && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label">
          <span className="text-ink-mid">Language</span>
          {PREVIEW_LOCALES.map((loc) => {
            const param = loc.toLowerCase();
            const active = locale === loc;
            return (
              <Link
                key={loc}
                href={`/admin/emails/${template.key}?lang=${param}`}
                scroll={false}
                className={cn(
                  "border px-2.5 py-1 transition-colors",
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink",
                )}
              >
                {loc}
              </Link>
            );
          })}
        </div>
      )}

      {/* subject line + test-send row */}
      <div className="mt-6 flex flex-col gap-4 border-b border-ink/10 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Subject
          </div>
          <div className="mt-1 truncate font-mono text-[13px] text-ink">
            {rendered?.subject ?? "—"}
          </div>
        </div>

        {/*
          The send-test form is a small client component because the useActionState
          hook that surfaces the success/error toast can only run on the client.

          Keyed by template+locale so the form remounts on each switch and the
          "Sent!" indicator from a previous locale doesn't linger while Sofia
          is flipping between languages.
        */}
        <TestSendForm
          key={`${template.key}:${locale}`}
          templateKey={template.key}
          locale={locale}
        />
      </div>

      {/* rendered HTML preview */}
      <div className="mt-6">
        {rendered ? (
          <iframe
            title={`${template.label} (${locale}) preview`}
            srcDoc={rendered.html}
            sandbox=""
            className="h-[720px] w-full border border-ink/10 bg-white"
          />
        ) : (
          <div className="flex h-[360px] w-full items-center justify-center border border-dashed border-ink/15 bg-white/40 text-[13px] text-ink-mid">
            This template returns nothing for the current fixture — try a
            different locale or fixture.
          </div>
        )}
      </div>

      {/* plain-text fallback */}
      {rendered && (
        <details className="mt-6 border border-ink/10 bg-white/60 p-4">
          <summary className="cursor-pointer text-[11px] uppercase tracking-label text-ink-mid">
            Plain-text version
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">
            {rendered.text}
          </pre>
        </details>
      )}
    </div>
  );
}
