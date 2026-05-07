// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/promotions — single page where Sofia controls every
// automated coupon's percentage and validity window.
//
// One Setting row underpins everything that displays a discount in the
// product:
//   · Welcome popup ("−10%")
//   · Registration confirmation email coupon
//   · Quiz reward coupon ("+15%" extra after the quiz)
//   · Quiz email + the personalised cart-restore link
//
// Edit a number here, save, and every surface picks it up on the next
// request. Already-issued coupons keep their original % (the value was
// frozen on the Coupon row at mint time — that's by design, so a customer
// who clicked through with 10% won't see Sofia accidentally bump them).
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Info } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { readPromoSettings } from "@/lib/queries/promotions";
import { savePromotionsAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string }>;

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin");
  const sp = await searchParams;
  const cfg = await readPromoSettings();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to admin
      </Link>

      <header className="mt-4 mb-10">
        <div className="eyebrow">Marketing</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Promotions
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          The percent-off values for Asian Beauty Shop&apos;s automated coupons. Editing
          a number here changes every place the discount is displayed (the
          welcome popup, exit-intent popup, quiz card, emails) <em>and</em>{" "}
          the actual discount applied to coupons issued going forward.
        </p>
        <div className="mt-4 flex items-start gap-2 border border-ink/10 bg-rice-dim/40 px-4 py-3 text-[12px] leading-relaxed text-ink-mid">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-mid" />
          <span>
            Already-issued coupons keep their original discount. If you
            change <code className="font-mono text-ink">10%</code> →{" "}
            <code className="font-mono text-ink">12%</code>, the next
            coupon minted from this moment is 12%. Customers who already
            redeemed (or hold) a 10% code still get 10%. This is the safe
            default — never silently moves the goalposts on a customer.
          </span>
        </div>
      </header>

      {sp.saved === "1" && (
        <div className="mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved. Refresh the homepage in a private window to see the new
          numbers in the popup.
        </div>
      )}

      <form action={savePromotionsAction} className="space-y-10">
        {/* ── Registration welcome ──────────────────────────────── */}
        <section>
          <h2 className="font-display text-[20px] text-ink">
            Registration welcome coupon
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Issued automatically when a new customer verifies their email.
            Single-use, first-order-only. Shown in the welcome popup and
            the registration confirmation email.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <NumberField
              label="Discount %"
              name="registrationWelcomePct"
              defaultValue={cfg.registrationWelcomePct}
              min={0}
              max={50}
              suffix="%"
              hint="0 disables (the popup will still display whatever text Sofia wrote, but the coupon won't apply a discount)."
            />
            <NumberField
              label="Validity (days)"
              name="registrationWelcomeValidDays"
              defaultValue={cfg.registrationWelcomeValidDays}
              min={1}
              max={365}
              suffix="days"
              hint="How long the customer has to redeem after the email is sent."
            />
          </div>
        </section>

        {/* ── Quiz reward ───────────────────────────────────────── */}
        <section className="border-t border-ink/10 pt-10">
          <h2 className="font-display text-[20px] text-ink">
            Quiz reward coupon
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Issued when a registered customer completes the skin quiz.
            Discounts only the items in their recommended routine
            (per-line discount, not whole-cart). Shown as &quot;+15% bonus&quot;
            in the welcome popup and on the quiz result card.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <NumberField
              label="Discount %"
              name="quizRewardPct"
              defaultValue={cfg.quizRewardPct}
              min={0}
              max={50}
              suffix="%"
            />
            <NumberField
              label="Validity (days)"
              name="quizRewardValidDays"
              defaultValue={cfg.quizRewardValidDays}
              min={1}
              max={365}
              suffix="days"
            />
          </div>
        </section>

        {/* ── Save ───────────────────────────────────────────────── */}
        <div className="border-t border-ink/10 pt-8">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Save promotions
          </button>
          <p className="mt-3 text-[11px] text-ink-mid">
            Bounds: 0–50% per discount, 1–365 days validity. Out-of-range
            values are clamped at save time.
          </p>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Number field with a visible suffix (% or days). Keeps the form short
// and avoids a label-vs-suffix layout puzzle on smaller screens.
// ─────────────────────────────────────────────────────────────────────────

function NumberField({
  label,
  name,
  defaultValue,
  min,
  max,
  suffix,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  suffix: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <div className="flex items-stretch border border-ink/15 bg-white focus-within:border-ink">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          min={min}
          max={max}
          step={1}
          required
          className="w-full border-0 bg-transparent px-3 py-2 text-[13px] text-ink focus:outline-none"
        />
        <span className="flex items-center border-l border-ink/15 bg-rice-dim/40 px-3 text-[11px] uppercase tracking-label text-ink-mid">
          {suffix}
        </span>
      </div>
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          {hint}
        </span>
      )}
    </label>
  );
}
