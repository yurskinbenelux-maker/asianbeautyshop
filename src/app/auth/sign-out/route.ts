// ─────────────────────────────────────────────────────────────────────────
// POST /auth/sign-out — clears the Supabase session cookie and redirects.
//
// Where the user ends up depends on where they came from:
//   • admin sign-out  → /sign-in      (default)
//   • customer sign-out → /[locale]   (passed via ?redirectTo=…)
//
// Enforces same-origin redirects to prevent open-redirect abuse.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  // Pull the redirect target from the POST body, falling back to a query
  // param for hrefs used from pure <a href="/auth/sign-out?redirectTo=…">
  // links (we don't use those today, but it's defensive).
  let redirectTo = request.nextUrl.searchParams.get("redirectTo");
  try {
    const form = await request.formData();
    const fromForm = form.get("redirectTo");
    if (typeof fromForm === "string" && fromForm.length > 0) {
      redirectTo = fromForm;
    }
  } catch {
    // Not a form body — that's fine, fall through.
  }

  // Only allow same-origin redirects so this endpoint can't be abused to
  // bounce users to a phishing page.
  const safeTarget =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/sign-in";

  return NextResponse.redirect(new URL(safeTarget, request.url), {
    status: 303, // See Other — tells the browser to switch POST → GET
  });
}
