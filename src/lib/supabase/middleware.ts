// ─────────────────────────────────────────────────────────────────────────
// Supabase middleware helpers — refresh the auth session cookie on every
// request so server components see a live `auth.getUser()` result.
//
// We expose two entry points:
//
//   updateSupabaseSession(request)
//     For non-localised routes (/admin, /sign-in, /auth/*).
//     Builds its own NextResponse.next and returns it.
//
//   refreshSupabaseSessionOnResponse(request, response)
//     For localised public routes where next-intl has already built a
//     response (adding locale prefixes, etc.). We piggy-back the Supabase
//     cookie refresh onto the existing response instead of replacing it.
//
// Without these, sessions silently expire and server components start
// seeing null users even when the browser thinks it's logged in.
// ─────────────────────────────────────────────────────────────────────────

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Shape of the items Supabase passes to the setAll cookies callback —
// the package's helper types aren't re-exported under a single name, so
// we spell it out here.
type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          // Mutate request first (so downstream reads see the fresh cookies),
          // then rebuild the response so it forwards them to the browser.
          toSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Calling getUser() is what triggers the refresh.  Do NOT remove this
  // line or the cookies won't rotate.
  await supabase.auth.getUser();

  return response;
}

/**
 * Refresh the Supabase session cookies on top of a response that some
 * other middleware already produced (typically next-intl's locale handler).
 * Mutates the passed-in response by adding rotated auth cookies; returns
 * the same response for ergonomic chaining.
 */
export async function refreshSupabaseSessionOnResponse(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          // Only write to the response — the intl middleware is in charge
          // of what goes back to the browser; we just piggy-back our cookies.
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}
