// ─────────────────────────────────────────────────────────────────────────
// /no-access — signed in, but the email isn't in ADMIN_ALLOWED_EMAILS.
// Polite dead-end with a sign-out link.
// ─────────────────────────────────────────────────────────────────────────

import { getCurrentUser } from "@/lib/auth";

export default async function NoAccessPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <div className="mb-12 flex items-center gap-3">
          <span className="font-display text-[22px] tracking-tight text-ink">
            YU.R
          </span>
          <span className="seal" aria-hidden>
            유
          </span>
        </div>

        <div className="eyebrow">Restricted</div>
        <h1 className="mt-3 font-display text-[34px] leading-tight text-ink">
          No access
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
          {user?.email ? (
            <>
              You're signed in as{" "}
              <span className="text-ink">{user.email}</span>, but this address
              isn't on the admin list. If this is a mistake, contact the YU.R
              team.
            </>
          ) : (
            <>You don't have access to this area.</>
          )}
        </p>

        <form action="/auth/sign-out" method="post" className="mt-10">
          <button
            type="submit"
            className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
