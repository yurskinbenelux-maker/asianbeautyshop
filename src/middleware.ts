// ─────────────────────────────────────────────────────────────────────────
// Middleware — two jobs, two modes:
//
//   1. Admin / auth (non-localised)  → refresh Supabase session cookies
//      so server-side getUser() sees a live token.
//
//   2. Public site (localised)       → next-intl handles locale detection
//      and redirects; if we're already on a final URL (not redirecting),
//      we also refresh the Supabase session on top so customer-side
//      pages like /en/account can use getCurrentCustomer() from RSC.
//
// Admin routes are NOT locale-prefixed on purpose: an admin works in one
// language, and splitting her panel across 4 locale trees would be noise.
// ─────────────────────────────────────────────────────────────────────────

import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  updateSupabaseSession,
  refreshSupabaseSessionOnResponse,
} from "./lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

function isAuthRoute(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname.startsWith("/auth") ||
    pathname === "/no-access"
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin + top-level auth tree — no i18n, just refresh the Supabase session.
  if (isAuthRoute(pathname)) {
    return await updateSupabaseSession(request);
  }

  // Everything else — let next-intl handle locale detection/redirects.
  const response = intlMiddleware(request);

  // If next-intl is redirecting (e.g. adding a locale prefix), honour it
  // as-is — there's no final URL yet to refresh a session on.
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  // Final localised URL — piggy-back the Supabase cookie refresh so RSC
  // calls to auth.getUser() from inside /[locale]/account work correctly.
  return await refreshSupabaseSessionOnResponse(request, response);
}

export const config = {
  // Match everything except Next internals, static assets, API routes,
  // and files with extensions (images, favicons, etc.).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
