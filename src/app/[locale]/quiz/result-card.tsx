// ─────────────────────────────────────────────────────────────────────────
// /[locale]/quiz — ritual result component.
//
// V2 changes:
//   · Renders up to 6 steps (cleanse → toner → treat → cream → mask → spf)
//     instead of 4. The number actually shown depends on the user's
//     ritualDepth + needsSpf, decided server-side in catalog.ts.
//   · One-line diagnosis above the grid: "Your skin: dry · main goal:
//     hydration" — generated from the QuizBrief the API returns.
//   · "Why these picks" expander shows which ingredients matched per
//     product (matchedIngredients on each RitualPick).
//   · "Add full ritual" CTA adds every product in one click.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RotateCcw,
  ShoppingBag,
} from "lucide-react";

import { Link } from "@/i18n/routing";
import { useCart } from "@/components/cart/cart-provider";
import type { RitualPick, RitualStep, QuizBrief } from "@/lib/ai/catalog";
import { formatEur, priceLocale } from "@/lib/utils";
import { claimQuizRitualAction } from "./actions";

// Step id → translation key in the concierge namespace.
const STEP_KEYS: Record<RitualStep, string> = {
  cleanse: "step_cleanse",
  toner: "step_toner",
  treat: "step_treat",
  cream: "step_cream",
  mask: "step_mask",
  spf: "step_spf",
};

export function RitualResult({
  ritual,
  brief,
  locale,
  onRetake,
}: {
  ritual: RitualPick[];
  brief: QuizBrief | undefined;
  locale: string;
  onRetake: () => void;
}) {
  const t = useTranslations("quizPage");
  const tConcierge = useTranslations("concierge");
  const uiLocale = useLocale();
  const { addItem } = useCart();

  // "Add my ritual" → server-side claim flow. Server action handles
  // auth-gating, mints the deterministic 15% coupon, fires the
  // restore-link email, and replaces the cart with the recommended
  // products carrying the per-line discount markers. We only need
  // pending + result state here — the redirect happens server-side.
  const [bundlePending, startBundleTransition] = useTransition();
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  // Only render steps that found a product. The rule-based engine may
  // return nulls when the catalogue is thin in a category.
  const filled = ritual.filter((r) => r.product !== null);

  // Total prices for the headline CTA. We show the original sum struck
  // through and the post-discount total in vermilion so the saving is
  // tangible before the customer clicks.
  const totalEur = filled.reduce(
    (sum, r) => sum + (r.product?.priceEur ?? 0),
    0,
  );
  const discountedEur = totalEur * 0.85;

  function claimRitual() {
    if (bundlePending) return;
    setBundleError(null);
    startBundleTransition(async () => {
      const ids = filled
        .map((r) => r.product?.id)
        .filter((id): id is string => typeof id === "string");
      if (ids.length === 0) return;
      const result = await claimQuizRitualAction({
        productIds: ids,
        locale,
      });
      if (!result.ok) {
        if (result.reason === "not-signed-in") {
          // Server tells us where to send them — sign-up with a
          // next= param that comes back to /quiz/result&ritual=…
          // so the full claim flow continues post-auth.
          window.location.href = result.redirectTo;
          return;
        }
        setBundleError(
          result.reason === "no-products"
            ? "Your ritual has no available products yet — try retaking the quiz."
            : "Something went wrong. Please try again or refresh the page.",
        );
        return;
      }
      // Success — redirect to /cart where the −15% chip + cart-line
      // strikethroughs render. Full reload so the cart provider picks
      // up the new server state.
      window.location.href = result.redirectTo;
    });
  }

  return (
    <div className="border border-ink/10 bg-white/70 px-6 py-10 md:px-12 md:py-14">
      {/* masthead */}
      <div className="text-center">
        <div className="eyebrow">{tConcierge("result_eyebrow")}</div>
        <h2 className="mt-3 font-display text-[28px] leading-tight text-ink md:text-[36px]">
          {t("result_title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
          {t("result_lede")}
        </p>

        {/* Diagnosis line — quick "we read your answers as X" reassurance.
            Built from the QuizBrief returned by the API so it reflects
            any reactivity bumps the server applied (e.g. dry + often
            reacts → server reclassified to sensitive). */}
        {brief ? (
          <p className="mx-auto mt-6 inline-flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] uppercase tracking-label text-ink-mid">
            <span>
              {tConcierge("result_diagnosis_label")}:{" "}
              <span className="text-ink">
                {tConcierge(`skin_label_${brief.skinType}`)}
              </span>
            </span>
            <span aria-hidden className="text-vermilion/60">
              ·
            </span>
            <span>
              {tConcierge("result_diagnosis_goal")}:{" "}
              <span className="text-ink">
                {tConcierge(`concern_label_${brief.primaryConcern}`)}
              </span>
            </span>
            {brief.secondaryConcerns.length > 0 ? (
              <>
                <span aria-hidden className="text-vermilion/60">
                  ·
                </span>
                <span className="text-ink">
                  {brief.secondaryConcerns
                    .slice(0, 3)
                    .map((c) => tConcierge(`concern_label_${c}`))
                    .join(" / ")}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {/* steps grid */}
      {filled.length > 0 ? (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filled.map((pick, idx) => (
            <RitualCard
              key={pick.step}
              pick={pick}
              index={idx}
              locale={uiLocale}
              urlLocale={locale}
              stepLabel={tConcierge(STEP_KEYS[pick.step])}
              addCtaLabel={t("add_to_cart")}
              addingCtaLabel={t("adding")}
              addedCtaLabel={t("added")}
              viewCtaLabel={t("view_product")}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-center text-[13px] italic text-ink-mid">
          {tConcierge("result_empty")}
        </p>
      )}

      {/* "Why these picks" — collapsed by default. Surfaces the matched
          INCI ingredients per product so the customer can see we didn't
          just throw popular products at them. */}
      {filled.length > 0 ? (
        <div className="mt-10 border-t border-ink/10 pt-6">
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
            aria-expanded={whyOpen}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                whyOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            />
            {tConcierge("result_why_label")}
          </button>

          {whyOpen ? (
            <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-ink-mid">
              <p>{tConcierge("result_why_intro")}</p>
              <ul className="space-y-2">
                {filled.map((pick) => {
                  if (!pick.product) return null;
                  return (
                    <li key={pick.step} className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-label text-ink">
                        {tConcierge(STEP_KEYS[pick.step])} ·{" "}
                        {pick.product.name}
                      </span>
                      {pick.matchedIngredients.length > 0 ? (
                        <span className="text-[12px] text-ink-mid">
                          {tConcierge("result_why_matched")}
                          <span className="text-ink">
                            {/* Slugs are humanised by replacing dashes with
                                spaces and lowercasing — not perfect for
                                things like "ascorbyl-glucoside" but reads
                                fine and avoids a separate translation. */}
                            {pick.matchedIngredients
                              .slice(0, 5)
                              .map((s) => s.replace(/-/g, " "))
                              .join(", ")}
                          </span>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* footer controls */}
      <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink/10 pt-8 sm:flex-row">
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {tConcierge("quiz_retake")}
        </button>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {filled.length > 1 ? (
            <div className="flex flex-col items-center gap-1.5 sm:items-stretch">
              <button
                type="button"
                onClick={claimRitual}
                disabled={bundlePending}
                className={`inline-flex items-center justify-center gap-2 px-5 py-3 text-[11px] uppercase tracking-label transition-colors bg-vermilion text-rice hover:bg-ink ${
                  bundlePending ? "cursor-wait opacity-80" : ""
                }`}
              >
                {bundlePending ? (
                  <>
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden
                    />
                    {t("adding")}
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {tConcierge("result_add_full_ritual")}
                    <span className="ml-1 inline-flex items-baseline gap-2">
                      <span className="text-rice/70 line-through">
                        {formatEur(totalEur, priceLocale(uiLocale))}
                      </span>
                      <span className="font-semibold">
                        {formatEur(discountedEur, priceLocale(uiLocale))}
                      </span>
                    </span>
                  </>
                )}
              </button>
              <p className="text-center text-[10.5px] uppercase tracking-label text-vermilion sm:text-right">
                −15% · registered customers · 60-day code
              </p>
              {bundleError ? (
                <p className="text-center text-[11px] text-vermilion sm:text-right">
                  {bundleError}
                </p>
              ) : null}
            </div>
          ) : null}
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 bg-ink px-5 py-3 text-[11px] uppercase tracking-label text-rice hover:bg-vermilion"
          >
            {tConcierge("result_cta")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ────────── single card ──────────────────────────────────────────────────

function RitualCard({
  pick,
  index,
  locale,
  urlLocale,
  stepLabel,
  addCtaLabel,
  addingCtaLabel,
  addedCtaLabel,
  viewCtaLabel,
}: {
  pick: RitualPick;
  index: number;
  locale: string; // UI locale for price formatting
  urlLocale: string; // locale segment for PDP links
  stepLabel: string;
  addCtaLabel: string;
  addingCtaLabel: string;
  addedCtaLabel: string;
  viewCtaLabel: string;
}) {
  const { addItem, isPending } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [localPending, setLocalPending] = useState(false);

  const product = pick.product!;

  async function handleAdd() {
    if (localPending || justAdded) return;
    setLocalPending(true);
    try {
      await addItem({ productId: product.id, quantity: 1 });
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2400);
    } finally {
      setLocalPending(false);
    }
  }

  const pending = localPending || (isPending && justAdded === false);

  void urlLocale;

  return (
    <li className="group flex flex-col border border-ink/10 bg-white/80">
      {/* image + step index */}
      <Link
        href={`/shop/${product.slug}`}
        className="relative block aspect-[4/5] overflow-hidden bg-ink/5"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
        {/* step chip */}
        <div className="absolute left-3 top-3 flex items-center gap-2 bg-white/85 px-2 py-1">
          <span className="font-kr text-[11px] leading-none text-vermilion">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[9px] uppercase tracking-label text-ink-mid">
            {stepLabel}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link
          href={`/shop/${product.slug}`}
          className="font-display text-[16px] leading-snug text-ink hover:text-vermilion"
        >
          {product.name}
        </Link>
        {product.tagline ? (
          <div className="mt-1 text-[12px] text-ink-mid line-clamp-2">
            {product.tagline}
          </div>
        ) : null}
        {/* Surface up to 2 matched ingredients as a quick "why this fits
            you" line — keeps the explanation visible without forcing a
            click on the expander below. */}
        {pick.matchedIngredients.length > 0 ? (
          <div className="mt-2 text-[11px] uppercase tracking-label text-vermilion/80">
            {pick.matchedIngredients
              .slice(0, 2)
              .map((s) => s.replace(/-/g, " "))
              .join(" · ")}
          </div>
        ) : null}
        <div className="mt-3 text-[14px] text-ink">
          {formatEur(product.priceEur, priceLocale(locale))}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            aria-busy={pending || undefined}
            className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] uppercase tracking-label transition-colors ${
              justAdded
                ? "bg-celadon text-rice"
                : "bg-ink text-rice hover:bg-vermilion"
            } ${pending ? "cursor-wait opacity-80" : ""}`}
          >
            {justAdded ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                {addedCtaLabel}
              </>
            ) : pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {addingCtaLabel}
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                {addCtaLabel}
              </>
            )}
          </button>
          <Link
            href={`/shop/${product.slug}`}
            className="text-center text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion/40 underline-offset-4 hover:text-vermilion"
          >
            {viewCtaLabel}
          </Link>
        </div>
      </div>
    </li>
  );
}
