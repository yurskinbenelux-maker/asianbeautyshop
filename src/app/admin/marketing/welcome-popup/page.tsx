// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/welcome-popup — edit every field of the on-load
// homepage popup that offers 10% off in exchange for account creation.
//
// Layout: a single form with grouped sections (Master switch, Image,
// Copy, Bonus blocks, CTA). Saves through the server action, redirects
// with ?saved=1, busts the public layout cache.
//
// Image URL is pasted (paste from /admin/media after upload). Same
// pattern an admin uses for /admin/homepage/hero — keeps muscle memory
// consistent across editors.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { readWelcomePopupSettings } from "@/lib/queries/welcome-popup";
import { saveWelcomePopupAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string }>;

export default async function AdminWelcomePopupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin");
  const sp = await searchParams;
  const cfg = await readWelcomePopupSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
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
          Welcome popup
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          The on-load popup that fires three seconds after a visitor lands
          on the homepage, offering 10% off in exchange for account
          creation. It auto-suppresses for 14 days after dismissal,
          and never fires for signed-in users or on auth/checkout/admin
          routes.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
          The popup only closes when the visitor clicks the X (or presses
          Escape) — clicking the dim backdrop no longer dismisses it, so
          a stray click won't cost you the offer.
        </p>
      </header>

      {sp.saved === "1" && (
        <div className="mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved. Refresh the homepage in a private window to see it.
        </div>
      )}

      <form action={saveWelcomePopupAction} className="space-y-10">
        {/* ── Master switch ──────────────────────────────────────── */}
        <section>
          <h2 className="font-display text-[18px] text-ink">Master switch</h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Untick to disable the popup entirely (without losing your
            edits). Useful during a campaign when you don't want a
            second offer competing.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={cfg.enabled}
              className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
            />
            <span>Popup is active on the public site</span>
          </label>

          <div className="mt-5 max-w-xs">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Delay before showing
              </span>
              <div className="flex items-stretch border border-ink/15 bg-white focus-within:border-ink">
                <input
                  type="number"
                  name="delaySeconds"
                  defaultValue={cfg.delaySeconds}
                  min={0}
                  max={60}
                  step={1}
                  required
                  className="w-full border-0 bg-transparent px-3 py-2 text-[13px] text-ink focus:outline-none"
                />
                <span className="flex items-center border-l border-ink/15 bg-rice-dim/40 px-3 text-[11px] uppercase tracking-label text-ink-mid">
                  seconds
                </span>
              </div>
              <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
                How long after first paint before the popup appears.
                3 seconds is the recommended default.
              </span>
            </label>
          </div>
        </section>

        {/* ── Image (left side of card) ──────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">
            Image (left side)
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Square recommended (around 800×800 px). Upload via{" "}
            <Link
              href="/admin/media"
              className="text-ink underline decoration-vermilion underline-offset-2"
            >
              /admin/media
            </Link>
            , then paste the URL below. Leave blank to render the popup
            single-column without an image.
          </p>

          {/* Live preview thumbnail when an image is set */}
          {cfg.imageUrl && (
            <div className="mt-4 flex items-start gap-4">
              <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden border border-ink/10 bg-ink/5">
                <Image
                  src={cfg.imageUrl}
                  alt={cfg.imageAlt}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
              <Link
                href={cfg.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
              >
                Open original
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          <div className="mt-4 space-y-4">
            <Field
              label="Image URL"
              name="imageUrl"
              defaultValue={cfg.imageUrl}
              placeholder="https://…/popup.jpg"
            />
            <Field
              label="Alt text (for screen readers + SEO)"
              name="imageAlt"
              defaultValue={cfg.imageAlt}
              placeholder="A model holding a Asian Beauty Shop Solution toner"
              hint="Describe what's in the image. Required if the image is set."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Image focus — desktop"
                name="imageObjectPositionDesktop"
                defaultValue={cfg.imageObjectPositionDesktop}
                placeholder="center"
                hint='CSS object-position. e.g. "center", "center top", "50% 30%", "30% center".'
              />
              <Field
                label="Image focus — mobile"
                name="imageObjectPositionMobile"
                defaultValue={cfg.imageObjectPositionMobile}
                placeholder="center"
                hint="Same syntax. Mobile shows a shorter crop — usually wants the focal point pushed up or down vs desktop."
              />
            </div>
          </div>
        </section>

        {/* ── Copy ───────────────────────────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">Headline copy</h2>
          <div className="mt-4 space-y-4">
            <Field
              label="Eyebrow (small uppercase label above the big number)"
              name="eyebrow"
              defaultValue={cfg.eyebrow}
              placeholder="Welcome gift"
              maxLength={60}
            />
            <Field
              label="Big offer (the large italic number)"
              name="bigOffer"
              defaultValue={cfg.bigOffer}
              placeholder="−10%"
              hint='Exact text shown — change to "FREE" or "GIFT" if you want a different feel.'
              maxLength={20}
            />
            <Field
              label="Big offer subtitle"
              name="bigOfferSubtitle"
              defaultValue={cfg.bigOfferSubtitle}
              placeholder="on your first order"
              maxLength={80}
            />
            <Field
              label="Headline"
              name="headline"
              defaultValue={cfg.headline}
              placeholder="Create your <em>Asian Beauty Shop</em> account."
              hint="Wrap any words in <em>…</em> to italicise them in vermilion (the brand accent)."
              maxLength={200}
            />
            <TextareaField
              label="Body paragraph"
              name="body"
              defaultValue={cfg.body}
              placeholder="Register in under a minute…"
              maxLength={600}
            />
          </div>
        </section>

        {/* ── Bonus block 1 — vermilion (+15% quiz reward) ────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">
            Bonus block 1 — vermilion stripe
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Shown directly under the body paragraph. Designed for the
            +15% quiz reward; you can repurpose for any second offer.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="bonus1Enabled"
              defaultChecked={cfg.bonus1Enabled}
              className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
            />
            <span>Show bonus block 1</span>
          </label>
          <div className="mt-4 space-y-4">
            <Field
              label="Bonus pill (italic accent)"
              name="bonus1Pct"
              defaultValue={cfg.bonus1Pct}
              placeholder="+15%"
              maxLength={20}
            />
            <TextareaField
              label="Bonus text"
              name="bonus1Text"
              defaultValue={cfg.bonus1Text}
              placeholder="extra after you register, when you take the **skin quiz**…"
              hint="Wrap key phrases in **double asterisks** to bold them."
              maxLength={300}
            />
          </div>
        </section>

        {/* ── Bonus block 2 — sage (YurClub) ─────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">
            Bonus block 2 — sage stripe
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Shown below bonus 1. Designed for YurClub points but can be
            repurposed.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="bonus2Enabled"
              defaultChecked={cfg.bonus2Enabled}
              className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
            />
            <span>Show bonus block 2</span>
          </label>
          <div className="mt-4 space-y-4">
            <TextareaField
              label="Bonus text"
              name="bonus2Text"
              defaultValue={cfg.bonus2Text}
              placeholder="Earn points on every purchase with **YurClub**…"
              hint="Wrap key phrases in **double asterisks** to bold them."
              maxLength={300}
            />
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">CTA button</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Button label"
              name="ctaLabel"
              defaultValue={cfg.ctaLabel}
              placeholder="Create my account"
              maxLength={80}
            />
            <Field
              label="Button target URL"
              name="ctaHref"
              defaultValue={cfg.ctaHref}
              placeholder="/en/sign-up"
              hint="Use a relative path like /en/sign-up so language detection still works."
              maxLength={2000}
            />
          </div>
          <label className="mt-4 inline-flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="showNoThanks"
              defaultChecked={cfg.showNoThanks}
              className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
            />
            <span>Show small &ldquo;No thanks&rdquo; link below the CTA</span>
          </label>
        </section>

        {/* ── Save ───────────────────────────────────────────────── */}
        <div className="border-t border-ink/10 pt-8">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Save popup
          </button>
          <p className="mt-3 text-[11px] text-ink-mid">
            Saving busts the homepage cache. To preview your change open
            the homepage in a private window — your normal browser may
            have the 14-day suppression cookie set.
          </p>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components — same field shapes used elsewhere in /admin/homepage,
// kept inline since they're small and the styling is consistent.
// ─────────────────────────────────────────────────────────────────────────

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        maxLength={maxLength ?? 2000}
      />
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          {hint}
        </span>
      )}
    </label>
  );
}

function TextareaField({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y border border-ink/15 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        maxLength={maxLength ?? 1000}
      />
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          {hint}
        </span>
      )}
    </label>
  );
}
