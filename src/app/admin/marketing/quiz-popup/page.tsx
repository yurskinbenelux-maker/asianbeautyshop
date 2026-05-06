// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/quiz-popup — edit the second on-load popup that
// nudges visitors toward the skin quiz. Mirror of the welcome popup
// admin, with one extra field for the after-welcome delay.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { readQuizPopupSettings } from "@/lib/queries/quiz-popup";
import { saveQuizPopupAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string }>;

export default async function AdminQuizPopupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin");
  const sp = await searchParams;
  const cfg = await readQuizPopupSettings();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/marketing"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to marketing
      </Link>

      <header className="mt-4 mb-10">
        <div className="eyebrow">Marketing</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Quiz popup
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          The second on-load popup. Fires after the welcome popup is
          finished — closed, dismissed, or skipped because the visitor
          is signed in. The configured delay (default 30 seconds) starts
          the moment the welcome popup is out of the way, so the two
          surfaces never overlap.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
          Same close behaviour as the welcome popup — only the X (or
          Escape key) dismisses, never the dim backdrop.
        </p>
      </header>

      {sp.saved === "1" && (
        <div className="mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved. Refresh the homepage in a private window to see it.
        </div>
      )}

      <form action={saveQuizPopupAction} className="space-y-10">
        {/* ── Master switch + delay ───────────────────────────────── */}
        <section>
          <h2 className="font-display text-[18px] text-ink">
            Master switch
          </h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Untick to disable the popup entirely without losing your
            edits.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={cfg.enabled}
              className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
            />
            <span>Quiz popup is active on the public site</span>
          </label>

          <div className="mt-5 max-w-xs">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Delay after welcome popup closes
              </span>
              <div className="flex items-stretch border border-ink/15 bg-white focus-within:border-ink">
                <input
                  type="number"
                  name="delaySecondsAfterWelcome"
                  defaultValue={cfg.delaySecondsAfterWelcome}
                  min={0}
                  max={300}
                  step={1}
                  required
                  className="w-full border-0 bg-transparent px-3 py-2 text-[13px] text-ink focus:outline-none"
                />
                <span className="flex items-center border-l border-ink/15 bg-rice-dim/40 px-3 text-[11px] uppercase tracking-label text-ink-mid">
                  seconds
                </span>
              </div>
              <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
                Counted from the moment the welcome popup is closed,
                dismissed, or skipped. 30 seconds is the recommended
                default — enough breathing room without losing the
                visitor.
              </span>
            </label>
          </div>
        </section>

        {/* ── Image (left side) ──────────────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">
            Image (left side)
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Square recommended (~800×800 px). Upload via{" "}
            <Link
              href="/admin/media"
              className="text-ink underline decoration-vermilion underline-offset-2"
            >
              /admin/media
            </Link>
            , then paste the URL. Leave blank for single-column layout.
          </p>

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
              placeholder="https://…/quiz-popup.jpg"
            />
            <Field
              label="Alt text"
              name="imageAlt"
              defaultValue={cfg.imageAlt}
              placeholder="A model with glowing skin after her routine"
              hint="Describe what's in the image."
            />
          </div>
        </section>

        {/* ── Copy ───────────────────────────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">Headline copy</h2>
          <div className="mt-4 space-y-4">
            <Field
              label="Eyebrow"
              name="eyebrow"
              defaultValue={cfg.eyebrow}
              placeholder="Skin assessment"
              maxLength={60}
            />
            <Field
              label="Big offer (italic)"
              name="bigOffer"
              defaultValue={cfg.bigOffer}
              placeholder="+15%"
              hint='Could be "+15%", "Quiz", "2 min", whatever feels right.'
              maxLength={20}
            />
            <Field
              label="Big offer subtitle"
              name="bigOfferSubtitle"
              defaultValue={cfg.bigOfferSubtitle}
              placeholder="your reward for taking the skin quiz"
              maxLength={80}
            />
            <Field
              label="Headline"
              name="headline"
              defaultValue={cfg.headline}
              placeholder="Discover your <em>routine</em>."
              hint="Wrap any words in <em>…</em> for vermilion italic."
              maxLength={200}
            />
            <TextareaField
              label="Body paragraph"
              name="body"
              defaultValue={cfg.body}
              placeholder="Two minutes, seven questions…"
              maxLength={600}
            />
          </div>
        </section>

        {/* ── Bonus block 1 — vermilion ───────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">
            Bonus block 1 — vermilion stripe
          </h2>
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
              label="Bonus pill"
              name="bonus1Pct"
              defaultValue={cfg.bonus1Pct}
              placeholder="2 min"
              maxLength={20}
            />
            <TextareaField
              label="Bonus text"
              name="bonus1Text"
              defaultValue={cfg.bonus1Text}
              placeholder="Built around Korean dermatology…"
              hint="Wrap **like this** for bold."
              maxLength={300}
            />
          </div>
        </section>

        {/* ── Bonus block 2 — sage ────────────────────────────────── */}
        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-display text-[18px] text-ink">
            Bonus block 2 — sage stripe
          </h2>
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
              placeholder="Optional second benefit"
              hint="Wrap **like this** for bold."
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
              placeholder="Take the skin quiz"
              maxLength={80}
            />
            <Field
              label="Button target URL"
              name="ctaHref"
              defaultValue={cfg.ctaHref}
              placeholder="/en/quiz"
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

        <div className="border-t border-ink/10 pt-8">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Save quiz popup
          </button>
        </div>
      </form>
    </div>
  );
}

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
