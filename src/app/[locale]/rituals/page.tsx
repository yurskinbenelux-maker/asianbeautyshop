// ─────────────────────────────────────────────────────────────────────────
// /[locale]/rituals — REDIRECTED.
//
// The dedicated "rituals" editorial page was retired when we renamed
// "ritual" to "skincare routine" sitewide and consolidated the funnel
// onto the homepage routine section + the skin quiz.
//
// We keep the route as a 308 (permanent) redirect to /quiz so any
// inbound links — Google search results, journal back-references,
// bookmarks — still land somewhere useful instead of 404'ing. SEO
// signal transfers cleanly with 308.
//
// Safe to fully `git rm` this file in a later cleanup once external
// links have stopped showing up in /admin/audit-log. The page is
// served by Next's catch-all so removing the file is the only way
// to fully drop the route.
// ─────────────────────────────────────────────────────────────────────────

import { permanentRedirect } from "next/navigation";

export const metadata = {
  // Tell crawlers not to index — the 308 already handles it but
  // noindex nudges them to refresh their cache faster.
  robots: { index: false, follow: false },
};

export default async function RitualsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  permanentRedirect(`/${locale.toLowerCase()}/quiz`);
}
