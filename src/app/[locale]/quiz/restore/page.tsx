// ─────────────────────────────────────────────────────────────────────────
// /[locale]/quiz/restore?token=… — magic-link landing page from the
// quiz-skincare routine-ready email.
//
// Three states:
//   · success → restore the cart with the recommended products + 15%
//     per-line discount, then redirect to /cart with a soft welcome
//     banner ("Welcome back — your skincare routine is waiting at 15% off.")
//   · expired → polite "Link expired" page with a CTA to retake the quiz
//   · already-used / not-found → "Already used" page with a "shop full
//     price" CTA
//
// The token in the URL is RAW (32-char base64url). We hash it server-side
// and look up the matching QuizCompletion. The same token never appears
// in the database — only its hash — so a leaked DB row can't redeem.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { redirect } from "next/navigation";
import { Locale } from "@prisma/client";

import { verifyCartLinkToken } from "@/lib/quiz/reward";
import { loadQuizRitualIntoCart } from "@/lib/cart/quiz-ritual";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your Asian Beauty Shop skincare routine · 15% off",
  // Don't index the magic-link landing page — it's a personal redemption
  // URL, not a public destination.
  robots: { index: false, follow: false },
};

type Params = { locale: string };
type SearchParams = { token?: string };

export default async function QuizRestorePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  const localePrefix = locale.toLowerCase();

  if (!token || typeof token !== "string") {
    return <ErrorState reason="not-found" localePrefix={localePrefix} />;
  }

  const result = await verifyCartLinkToken(token);
  if (!result.ok) {
    return <ErrorState reason={result.reason} localePrefix={localePrefix} />;
  }

  // Token valid → load the skincare routine into the cart and redirect.
  // The cart will pick up the per-line discount markers and the cart
  // page UI will render the −15% chip + strikethrough.
  await loadQuizRitualIntoCart({
    productIds: result.recommendedProductIds,
    locale: toPrismaLocale(locale),
  });

  redirect(`/${localePrefix}/cart?ritual=restored`);
}

// ────────── error states ───────────────────────────────────────────────

function ErrorState({
  reason,
  localePrefix,
}: {
  reason: "not-found" | "expired" | "redeemed";
  localePrefix: string;
}) {
  const copy = {
    "not-found": {
      heading: "Link not recognised.",
      body: "This restore link doesn't match any active quiz session. The link may have been copied incorrectly — try opening it directly from your email.",
      ctaHref: `/${localePrefix}/quiz`,
      ctaLabel: "Take the quiz",
    },
    expired: {
      heading: "Your skincare routine link has expired.",
      body: "Quiz rewards are valid for 60 days from the date of completion. Retake the quiz any time to receive a fresh personalised skincare routine at −15%.",
      ctaHref: `/${localePrefix}/quiz`,
      ctaLabel: "Retake the quiz",
    },
    redeemed: {
      heading: "This skincare routine has been redeemed.",
      body: "You've already used this quiz reward. Browse the full collection at our regular pricing — and thank you for being part of Asian Beauty Shop.",
      ctaHref: `/${localePrefix}/shop`,
      ctaLabel: "Browse the shop",
    },
  }[reason];

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="eyebrow text-vermilion">Quiz reward</p>
      <h1 className="mt-3 font-display text-[40px] leading-tight text-ink">
        {copy.heading}
      </h1>
      <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-ink-mid">
        {copy.body}
      </p>
      <Link
        href={copy.ctaHref}
        className="mt-10 inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice transition-colors hover:border-vermilion hover:bg-vermilion"
      >
        {copy.ctaLabel}
        <svg
          viewBox="0 0 14 10"
          className="h-2.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M1 5 H13 M9 1 L13 5 L9 9" />
        </svg>
      </Link>
    </div>
  );
}

function toPrismaLocale(s: string): Locale {
  switch (s.toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}
