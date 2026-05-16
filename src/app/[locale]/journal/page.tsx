// ─────────────────────────────────────────────────────────────────────────
// /[locale]/journal — the public journal index.
//
// Every PUBLISHED post in the user's locale (with EN fallback) in a calm
// editorial grid. When the admin hasn't published anything yet, we render
// a gentle "something is coming" state rather than an empty page — an admin
// has been told by me that posts will ship in the first week of August,
// so an empty state is possible up until then.
//
// Kept intentionally simple: no filters, no search, no pagination. If the
// journal ever outgrows ~100 posts we'll paginate; until then this is
// just a list.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { listPublishedJournalPosts } from "@/lib/queries/journal";
import { priceLocale } from "@/lib/utils";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JournalCard } from "@/components/home/journal-card";
import { getSiteCopy, siteCopyOr } from "@/lib/queries/site-copy";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "journal" });
  return buildPageMetadata({
    locale,
    tail: "/journal",
    title: t("meta_title"),
    description: t("meta_description"),
  });
}

export default async function JournalIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, copy, posts] = await Promise.all([
    getTranslations("journal"),
    getSiteCopy(locale, ["journal.index"]),
    listPublishedJournalPosts(locale),
  ]);

  // Header trio is admin-editable. Empty-state, meta titles and the
  // by-line fallback stay in the messages catalogue. siteCopyOr() honours
  // the SITE_COPY_VOID sentinel — if an admin hides a field, this returns ""
  // and the page conditionally drops the wrapper below.
  const header = {
    eyebrow: siteCopyOr(copy, "journal.index", "eyebrow", t("eyebrow")),
    title: siteCopyOr(copy, "journal.index", "title", t("title")),
    lede: siteCopyOr(copy, "journal.index", "lede", t("lede")),
  };

  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    month: "long",
    year: "numeric",
  });

  return (
    <section className="container py-20 md:py-28">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="max-w-2xl">
        {header.eyebrow ? <div className="eyebrow">{header.eyebrow}</div> : null}
        {header.title ? (
          <h1 className="mt-3 font-display text-display-lg leading-tight text-ink">
            {header.title}
          </h1>
        ) : null}
        {header.lede ? (
          <p className="mt-6 text-[15px] leading-relaxed text-ink-mid">
            {header.lede}
          </p>
        ) : null}
      </div>

      <div className="rule my-12" />

      {posts.length === 0 ? (
        // ── empty state ───────────────────────────────────────
        // Calm, not apologetic. The copy does the work — no skeleton
        // cards or fake placeholders (that would read as broken).
        <div className="max-w-xl py-10">
          <div className="eyebrow">{t("empty_eyebrow")}</div>
          <p className="mt-4 font-display text-display-sm leading-tight text-ink">
            {t("empty_title")}
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
            {t("empty_body")}
          </p>
          <Link
            href="/shop"
            className="mt-8 inline-block text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
          >
            {t("empty_cta")}
          </Link>
        </div>
      ) : (
        // ── grid of published posts ───────────────────────────
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {posts.map((p, i) => (
            <JournalCard
              key={p.id}
              index={i}
              href={`/journal/${p.slug}`}
              coverUrl={p.coverUrl}
              coverObjectPositionDesktop={p.coverObjectPositionDesktop}
              coverObjectPositionMobile={p.coverObjectPositionMobile}
              eyebrow={p.authorName ?? header.eyebrow}
              title={p.title}
              subline={dateFmt.format(p.publishedAt)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
