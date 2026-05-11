// ─────────────────────────────────────────────────────────────────────────
// Journal teaser — three most recent PUBLISHED posts, pulled from the DB.
//
// This is a server component so we can hit Prisma directly. When the DB
// has no published posts yet (early days), we fall back to three editorial
// "coming soon" placeholders so the homepage never has a blank strip.
//
// The card itself is animated — that part is factored into the small
// client child `JournalCard`, which also honours prefers-reduced-motion
// via Framer Motion's built-in reducedMotion handling.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from "@/i18n/routing";
import { getJournalTeasers } from "@/lib/queries/journal";
import { priceLocale } from "@/lib/utils";
import { JournalCard } from "./journal-card";

// Fallback strip used only when the DB has zero published posts.
const FALLBACK = [
  {
    eyebrow: "Ingredient",
    title: "Ginseng, slowly",
    gradient: "from-vermilion/20 via-rice to-ink/10",
  },
  {
    eyebrow: "Heritage",
    title: "The Joseon moon jar",
    gradient: "from-ink/10 via-bone to-vermilion/10",
  },
  {
    eyebrow: "Ritual",
    title: "The first gesture of the morning",
    gradient: "from-bone via-rice to-vermilion/20",
  },
];

// `coming_soon` is the subline under each fallback card — only visible when
// the DB has no published posts. It isn't worth an admin surface of its own
// yet, so it rides along with the journal-teaser copy block.
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
          {posts.length > 0
            ? posts.map((p, i) => (
                <JournalCard
                  key={p.id}
                  index={i}
                  href={`/journal/${p.slug}`}
                  coverUrl={p.coverUrl}
                  eyebrow={p.authorName ?? copy.eyebrow}
                  title={p.title}
                  subline={dateFmt.format(p.publishedAt)}
                />
              ))
            : FALLBACK.map((p, i) => (
                <JournalCard
                  key={p.title}
                  index={i}
                  href="/journal"
                  gradient={p.gradient}
                  eyebrow={p.eyebrow}
                  title={p.title}
                  subline={copy.coming_soon}
                />
              ))}
        </div>
      </div>
    </section>
  );
}
