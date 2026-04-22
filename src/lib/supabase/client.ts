// ─────────────────────────────────────────────────────────────────────────
// Supabase browser client — use from "use client" components.
// Reads session from document.cookie so sign-out buttons, real-time
// subscriptions, etc. work.
// ─────────────────────────────────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
