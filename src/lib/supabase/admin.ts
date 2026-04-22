// ─────────────────────────────────────────────────────────────────────────
// Service-role Supabase client — SERVER ONLY.
//
// This client bypasses Row-Level Security. It must never be imported
// into a client component. Typical callers: admin server actions
// ("use server" files) that write to Storage buckets, run database
// maintenance, etc.
//
// Initialisation is LAZY on purpose: if we throw at module-top-level
// because SUPABASE_SERVICE_ROLE_KEY is missing, any file importing this
// module will fail to load — which includes the Server Actions file —
// which in turn makes the client bundle's RPC stubs resolve to undefined.
// That surfaces as the notorious Webpack error:
//    "Cannot read properties of undefined (reading 'call')"
// Lazy init keeps the module loadable and defers the error to the
// actual upload call, where we can render a clean admin-facing message.
//
// If you want the belt-AND-braces build-time check, install the
// `server-only` package (`npm i server-only`) and uncomment the import
// below — it will fail the build if any client-bundled module imports
// this file.
// ─────────────────────────────────────────────────────────────────────────

// import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Name of the bucket holding product imagery. Change here only. */
export const PRODUCT_MEDIA_BUCKET = "products";

let cached: SupabaseClient | null = null;

/**
 * Lazy singleton. Call from inside Server Actions only.
 * Throws a human-readable error if env vars are missing.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Restart the dev server after adding them.",
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
