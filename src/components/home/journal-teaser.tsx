// ─────────────────────────────────────────────────────────────────────────
// Journal teaser — three most recent PUBLISHED posts, pulled from the DB.
//
// This is a server component so we can hit Prisma directly. Filtering is
// done at the query layer (getJournalTeasers): only posts where status =
// PUBLISHED and publishedAt <= now() are returned — drafts and scheduled
// posts never appear here.
//
// Zero-state behaviour: when the DB has no qualifying posts, the entire
// section is hidden (component returns null). The homepage rhythm
// collapses cleanly to the next section.
//
// Previously we rendered three "coming soon" placeholder tiles in that
// case — but they linked to /journal which 404'd on click, and they kept
// showing after admin deleted the last published post, looking like
// stale ghost content. Hiding the section is the honest UX.
//
// The card itself is animated — that part is factored into the small
// client child `JournalCard`, which also honours prefers-reduced-motion
// via Framer Motion's built-in reducedMotion handling.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from "@/i18n/routing";
import { getJournalTeasers } from "@/lib/queries/journal";
import { priceLocale } from "@/lib/utils";
import { JournalCard } from "./journal-card";

// `coming_soon` is kept on the copy type for backwards compatibility with
// the SiteCopy admin editor and the en/nl/fr/ru JSON fallbacks. The
// component itself no longer renders it (the empty-state shows nothing
// at all rather than placeholder tiles), but the field is harmless to
// keep around in case we want to revive a "coming soon" splash later.
export type JournalTeaserCopy = {
  eyebrow: string;
  lede: string;
  read_all: string;
  coming_soon: string;
};

type Props = {
  locale: string;
  copy: JournalTeaserCopy;
};

export async function JournalTeaser({ locale, copy }: Props) {
  const posts = await getJournalTeasers(locale, 3);

  // Zero published posts → hide the entire section. No header, no
  // placeholder tiles, no "Read all" link to an empty list. The
  // homepage just skips straight to whatever section follows.
  if (posts.length === 0) return null;

  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    month: "long",
    year: "numeric",
  });

  return (
    // Luxury polish #02: bg-rice-dim/50 → bg-rice-dim. Full strength so
    // the alternating rhythm (rice → rice-dim → rice → rice-dim → rice
    // through the homepage) reads as deliberate depth rather than ambient.
    <section className="bg-rice-dim py-32">
      <div className="container">
        <div className="mb-16 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            {copy.eyebrow ? <div className="eyebrow">{copy.eyebrow}</div> : null}
            {copy.lede ? (
              <h2 className="mt-3 max-w-[26ch] text-display-md">{copy.lede}</h2>
            ) : null}
          </div>
          {copy.read_all ? (
            <Link
              href="/journal"
              className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 hover:text-vermilion"
            >
              {copy.read_all}
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {posts.map((p, i) => (
            <JournalCard
              key={p.id}
              index={i}
              href={`/journal/${p.slug}`}
              coverUrl={p.coverUrl}
              coverObjectPositionDesktop={p.coverObjectPositionDesktop}
              coverObjectPositionMobile={p.coverObjectPositionMobile}
              eyebrow={p.authorName ?? copy.eyebrow}
              title={p.title}
              subline={dateFmt.format(p.publishedAt)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
