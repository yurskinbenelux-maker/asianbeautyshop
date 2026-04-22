// ─────────────────────────────────────────────────────────────────────────
// i18n routing — next-intl locale config
// Locales: EN (default), NL (Dutch for BE/NL customers), FR (Belgian French),
// RU (Russian-speaking expats — a K-beauty audience Sofia asked us to cover).
// ─────────────────────────────────────────────────────────────────────────

import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["en", "nl", "fr", "ru"] as const,
  defaultLocale: "en",

  // Always prefix URLs with locale (/en/shop, /nl/shop) — cleaner for SEO
  // and avoids any ambiguity between root and default-locale pages.
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

// Typed wrappers around Next's <Link>, useRouter, etc. — use these everywhere
// instead of next/link so the locale is handled automatically.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
