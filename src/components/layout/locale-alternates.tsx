// ─────────────────────────────────────────────────────────────────────────
// LocaleAlternates — a small context that lets pages tell the locale
// switcher "when the user picks NL on this page, go to THIS path".
//
// Why: most pages share paths across locales (/shop, /about, /cart), so
// the locale switcher can just call router.replace(pathname, {locale}).
// But product detail pages have per-locale slugs — /shop/rice-cleanser
// vs /shop/rijstwater-reiniger. Without this context, clicking NL on an
// EN product page lands on a 404.
//
// Usage:
//   <LocaleAlternatesProvider
//     alternates={{ en: "/shop/rice-cleanser", nl: "/shop/rijstwater-…" }}
//   >
//     …page content…
//   </LocaleAlternatesProvider>
//
// The provider is a client component (context requires that). It doesn't
// need to be placed at the root — the nearest provider wins, and the
// switcher uses its output without needing to re-render the whole tree.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Map from lowercase locale code ("en", "nl", "fr", "ru") to absolute path. */
export type AlternatesMap = Partial<Record<string, string>>;

const LocaleAlternatesContext = createContext<AlternatesMap | null>(null);

export function LocaleAlternatesProvider({
  alternates,
  children,
}: {
  alternates: AlternatesMap;
  children: ReactNode;
}) {
  return (
    <LocaleAlternatesContext.Provider value={alternates}>
      {children}
    </LocaleAlternatesContext.Provider>
  );
}

/** Returns the alternates map if one is provided by an ancestor, else null. */
export function useLocaleAlternates(): AlternatesMap | null {
  return useContext(LocaleAlternatesContext);
}
