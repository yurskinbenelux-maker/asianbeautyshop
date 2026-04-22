// ─────────────────────────────────────────────────────────────────────────
// /sign-in — single-field email form that fires off a magic link.
// Centered editorial card on rice-paper background.
// ─────────────────────────────────────────────────────────────────────────

import { SignInForm } from "./sign-in-form";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        {/* masthead */}
        <div className="mb-12 flex items-center gap-3">
          <span className="font-display text-[22px] tracking-tight text-ink">
            YU.R
          </span>
          <span className="seal" aria-hidden>
            유
          </span>
        </div>

        <div className="eyebrow">Admin</div>
        <h1 className="mt-3 font-display text-[34px] leading-tight text-ink">
          Sign in
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
          Enter your email and we'll send you a one-time sign-in link.
          No password required.
        </p>

        <div className="mt-10">
          <SignInForm next={next ?? "/admin"} />
        </div>

        <p className="mt-10 text-[11px] uppercase tracking-label text-ink-mid">
          Access is limited to approved addresses.
        </p>
      </div>
    </main>
  );
}
