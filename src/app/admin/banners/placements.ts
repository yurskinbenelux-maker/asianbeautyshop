// ─────────────────────────────────────────────────────────────────────────
// Banner placement slots — the fixed list of places on the site where a
// banner can appear. Defined outside `actions.ts` because Next 15's strict
// build rejects non-async exports from a "use server" file.
//
// When you add a new placement, wire the frontend banner lookup to know
// about it too.
// ─────────────────────────────────────────────────────────────────────────

export const PLACEMENTS = [
  { id: "home.hero", label: "Homepage · hero" },
  { id: "home.announcement", label: "Homepage · announcement strip" },
  { id: "home.promo", label: "Homepage · promo card" },
  { id: "shop.top", label: "Shop · top banner" },
] as const;

export const PLACEMENT_IDS = PLACEMENTS.map((p) => p.id) as [
  string,
  ...string[],
];
