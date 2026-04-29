// ─────────────────────────────────────────────────────────────────────────
// Recently-viewed products — localStorage helper + types.
//
// Lives entirely client-side: zero server roundtrips, zero cookies, no
// consent banner needed (localStorage isn't covered by ePrivacy when
// it's purely functional UX state). The list persists across sessions
// on the same browser; cleared after 30 days idle per row.
//
// Schema (localStorage key = "yur_recently_viewed"):
//   {
//     items: [
//       { slug, name, imageUrl|null, priceEur, comparePriceEur|null, addedAt },
//       …
//     ]
//   }
//
// Capped at 10 items. New entries push to the front; duplicates by slug
// are removed before insertion so re-viewing a product moves it to the
// top instead of duplicating.
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "yur_recently_viewed";
const MAX_ITEMS = 10;
const TTL_DAYS = 30;

export type RecentlyViewedItem = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceEur: number;
  comparePriceEur: number | null;
  /** ISO timestamp — used for TTL pruning. */
  addedAt: string;
};

type Stored = {
  items: RecentlyViewedItem[];
};

function safeRead(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || !Array.isArray(parsed.items)) return [];
    // TTL prune — drop anything older than the cutoff. Cheap on every
    // read; localStorage is small.
    const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;
    return parsed.items.filter((it) => {
      const t = Date.parse(it.addedAt);
      return Number.isFinite(t) && t >= cutoff;
    });
  } catch {
    return [];
  }
}

function safeWrite(items: RecentlyViewedItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items } satisfies Stored),
    );
  } catch {
    // Quota / privacy mode — silently no-op. Recently-viewed is
    // best-effort UX; never break the page over it.
  }
}

/** Read the list, freshest first. Already TTL-pruned. */
export function readRecentlyViewed(): RecentlyViewedItem[] {
  return safeRead();
}

/**
 * Push a product to the top of the list. De-dupes by slug; caps to
 * MAX_ITEMS; updates `addedAt` so re-views float to the front.
 */
export function recordRecentlyViewed(
  item: Omit<RecentlyViewedItem, "addedAt">,
): void {
  if (typeof window === "undefined") return;
  const current = safeRead();
  const filtered = current.filter((it) => it.slug !== item.slug);
  const next: RecentlyViewedItem[] = [
    { ...item, addedAt: new Date().toISOString() },
    ...filtered,
  ].slice(0, MAX_ITEMS);
  safeWrite(next);
}

/** Drop everything. Wired to "Clear" buttons in the rail UI. */
export function clearRecentlyViewed(): void {
  safeWrite([]);
}
