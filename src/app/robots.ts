// ─────────────────────────────────────────────────────────────────────────
// /robots.txt — crawler directives.
//
// Policy:
//   · allow everything by default
//   · disallow /admin and /account (both require auth — no value to crawl)
//   · disallow /api (server-only; responses are not content)
//   · disallow password flows (/forgot-password, /reset-password) — they
//     contain no indexable content and appear under every locale prefix
//   · point at the sitemap at the canonical origin so the crawler can
//     discover product URLs without having to guess locale prefixes
//
// The disallow paths use `*` prefixes so they match under every locale —
// e.g. /en/account, /nl/admin, /fr/forgot-password, etc.
// ─────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";

function getOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_ORIGIN ??
    "https://asianbeautyshop.eu";
  return raw.replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const origin = getOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/*/account",
          "/*/account/",
          "/*/forgot-password",
          "/*/reset-password",
          "/*/auth/",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
