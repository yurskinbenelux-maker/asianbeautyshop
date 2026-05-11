// ─────────────────────────────────────────────────────────────────────────
// /admin/homepage — index of editable copy sections.
//
// Each card is a section (hero, bestsellers, ritual, newsletter, footer…).
// Click in → edit every field for that section × 4 locales. Rows in the DB
// override the messages/{locale}.json catalogue; leaving a field blank falls
// back to the default so an admin doesn't have to fill in all four languages
// before anything ships.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowRight, FileEdit, Film, LayoutTemplate } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  SITE_COPY_SCHEMA,
  SITE_COPY_SECTION_LABELS,
  type SiteCopySection,
} from "@/lib/queries/site-copy";

export const dynamic = "force-dynamic";

type SectionRow = {
  section: SiteCopySection;
  label: string;
  fieldCount: number;
  overrideCount: number;
};

async function loadOverrideCounts(): Promise<Map<string, number>> {
  // Group by section → count how many (field, locale) cells an admin has set.
  const rows = await prisma.siteCopy.groupBy({
    by: ["section"],
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.section, r._count._all);
  return map;
}

export default async function AdminHomepageIndex() {
  const counts = await loadOverrideCounts();

  const sections: SectionRow[] = (
    Object.keys(SITE_COPY_SCHEMA) as SiteCopySection[]
  ).map((section) => ({
    section,
    label: SITE_COPY_SECTION_LABELS[section],
    fieldCount: SITE_COPY_SCHEMA[section].length,
    overrideCount: counts.get(section) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-10 max-w-3xl">
        <div className="eyebrow">Website copy</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Edit the words on the public site
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          These are the headlines, taglines, and small sentences that appear on
          the homepage and editorial pages. Everything here is optional — if
          you leave a field blank, the default English text is used (and
          translated automatically where we've already shipped translations).
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
          Click a section to edit it in all four languages at once.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.section}
            href={`/admin/homepage/${encodeURIComponent(s.section)}`}
            className="group flex items-start gap-4 border border-ink/10 bg-white/60 p-5 transition-colors hover:border-ink/25 hover:bg-white/80"
          >
            <FileEdit className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-mid group-hover:text-ink" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate font-display text-[18px] text-ink">
                  {s.label}
                </div>
              </div>
              <div className="mt-0.5 font-mono text-[11px] tracking-label text-ink-mid">
                {s.section}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
                <span>
                  {s.fieldCount} {s.fieldCount === 1 ? "field" : "fields"}
                </span>
                <span aria-hidden>·</span>
                {s.overrideCount > 0 ? (
                  <span className="inline-flex items-center gap-1 border border-sage/40 px-2 py-0.5 text-sage">
                    {s.overrideCount}{" "}
                    {s.overrideCount === 1 ? "override" : "overrides"}
                  </span>
                ) : (
                  <span>Default text</span>
                )}
              </div>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-ink-mid/0 transition-opacity group-hover:text-ink group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      {/* ── beyond text: hero variant + video reel ──────────────────── */}
      <div className="mt-12 border-t border-ink/10 pt-8">
        <div className="eyebrow">Beyond text</div>
        <h2 className="mt-2 font-display text-[20px] text-ink">
          Cinematic content
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <Link
            href="/admin/homepage/hero"
            className="group flex items-start gap-4 border border-ink/10 bg-white/60 p-5 transition-colors hover:border-ink/25 hover:bg-white/80"
          >
            <LayoutTemplate className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-mid group-hover:text-ink" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[18px] text-ink">
                Homepage hero variant
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                Switch the very first thing visitors see — typography
                (default), full-bleed cinematic video, or an asymmetric
                three-product editorial collage. Same headline copy in
                every variant.
              </p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-ink-mid/0 transition-opacity group-hover:text-ink group-hover:opacity-100" />
          </Link>

          <Link
            href="/admin/homepage/video"
            className="group flex items-start gap-4 border border-ink/10 bg-white/60 p-5 transition-colors hover:border-ink/25 hover:bg-white/80"
          >
            <Film className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-mid group-hover:text-ink" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[18px] text-ink">
                Homepage video reel
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                Pick between one cinematic 16:9 clip or a trio of 9:16
                Instagram-style portrait reels under the hero. Off by
                default.
              </p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-ink-mid/0 transition-opacity group-hover:text-ink group-hover:opacity-100" />
          </Link>
        </div>
      </div>

      <div className="mt-10 border-t border-ink/10 pt-6 text-[12px] leading-relaxed text-ink-mid">
        <p>
          <span className="font-medium text-ink">Tip —</span> you don't need to
          translate everything. If a language is blank, the site uses the
          English text. Write what you can, save, and come back later.
        </p>
      </div>
    </div>
  );
}
