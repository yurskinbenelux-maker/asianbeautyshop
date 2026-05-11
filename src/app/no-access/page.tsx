// ─────────────────────────────────────────────────────────────────────────
// /no-access — landing page for "signed in, but can't see this".
//
// Two distinct causes land here:
//   1. Email isn't on any admin allow-list (ADMIN/EDITOR/FULFILMENT).
//   2. Email is on an allow-list but lacks the capability for the
//      specific page they tried to open (e.g. editor clicked Settings).
//
// The copy is deliberately generic — the page doesn't know *why* access
// was denied. We show a sign-out affordance + a way back to the part of
// the admin they CAN see, plus a resolved-role pill so editors/fulfilment
// understand their scope.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { resolveAdminRole } from "@/lib/auth-roles";
import { Logo } from "@/components/brand/logo";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  FULFILMENT: "Fulfilment",
};

export default async function NoAccessPage() {
  const user = await getCurrentUser();
  const role = resolveAdminRole(user?.email);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        {/* Brand mark — full vertical lockup, generous height for the
            centered editorial layout. */}
        <div className="mb-12">
          <Logo variant="lockup" height={64} alt="Asian Beauty Shop" />
        </div>

        <div className="eyebrow">Restricted</div>
        <h1 className="mt-3 font-display text-[34px] leading-tight text-ink">
          No access
        </h1>

        {user?.email ? (
          <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
            You're signed in as{" "}
            <span className="text-ink">{user.email}</span>
            {role ? (
              <>
                {" "}as <span className="rounded-full border border-ink/15 px-2 py-[1px] text-[10px] uppercase tracking-label text-ink-mid">{ROLE_LABEL[role]}</span>,
                but this specific section is outside your scope.
              </>
            ) : (
              <>, but this address isn't on any admin allow-list.</>
            )}
            {" "}If this is a mistake, contact the Asian Beauty Shop team.
          </p>
        ) : (
          <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
            You don't have access to this area.
          </p>
        )}

        <div className="mt-10 flex items-center gap-8">
          {role ? (
            <Link
              href="/admin"
              className="text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
            >
              Back to admin
            </Link>
          ) : null}
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
