// ─────────────────────────────────────────────────────────────────────────
// Supabase server client — use from Server Components, Server Actions,
// and Route Handlers.  Reads auth cookies via next/headers so getUser()
// actually knows who is logged in.
//
// DO NOT import this from a client component; it uses next/headers.
// ─────────────────────────────────────────────────────────────────────────

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          // setAll throws when called from a server component (cookies are
          // read-only there). Middleware refreshes the session, so ignoring
          // write attempts here is safe.
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* server component — ignore */
          }
        },
      },
    },
  );
}
