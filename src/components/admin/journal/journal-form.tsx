"use client";

// ─────────────────────────────────────────────────────────────────────────
// JournalForm — shared create/edit form for journal posts.
//
// Locale tabs switch the per-language panels (title / slug / excerpt / body
// / SEO). Master fields (status, publish date, cover, author) sit above
// the tabs. Body is a plain HTML textarea for now — swap in Tiptap later.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useRef, useState } from "react";
import {
  createJournalPostAction,
  updateJournalPostAction,
  type ActionState,
} from "@/app/admin/journal/actions";
import { Locale, PostStatus } from "@prisma/client";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { FocalPointPicker } from "@/components/admin/marketing/focal-point-picker";
import { setNativeInputValue } from "@/lib/admin/native-input";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

/** Fields we feed through DeepL. Slug is excluded — it's URL-shaped and
 *  an admin derives it from the translated title herself. */
const TRANSLATABLE_FIELDS: ReadonlyArray<{
  name: "title" | "excerpt" | "body" | "seoTitle" | "seoDescription";
  isHtml: boolean;
}> = [
  { name: "title", isHtml: false },
  { name: "excerpt", isHtml: false },
  { name: "body", isHtml: true },
  { name: "seoTitle", isHtml: false },
  { name: "seoDescription", isHtml: false },
];

const INITIAL_STATE: ActionState = { ok: false };

type Translation = {
  locale: Locale;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
};

export type JournalFormInitial = {
  id?: string;
  status: PostStatus;
  publishedAt: Date | null;
  /** Card thumbnail (4:5). Shows on /journal listing + homepage teaser. */
  coverUrl: string | null;
  /** Per-viewport CSS object-position values applied to the cover
   *  image. Lets an admin shift the focal point so the 4:5 crop
   *  doesn't cut off the most important part of a portrait photo on
   *  mobile. Both default to "center" when null. */
  coverObjectPositionDesktop: string | null;
  coverObjectPositionMobile: string | null;
  /** Article hero (16:9). Shows at top of /journal/[slug]. Optional —
   *  falls back to coverUrl when null. */
  heroUrl: string | null;
  /** Same per-viewport focal-point knobs as cover, but for the
   *  article hero image — particularly useful on mobile where the
   *  16:9 desktop hero collapses to a much taller letterbox. */
  heroObjectPositionDesktop: string | null;
  heroObjectPositionMobile: string | null;
  authorName: string | null;
  translations: Record<Locale, Translation>;
};

const EMPTY_TRANSLATION = (locale: Locale): Translation => ({
  locale,
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  seoTitle: "",
  seoDescription: "",
});

const EMPTY: JournalFormInitial = {
  status: "DRAFT",
  publishedAt: null,
  coverUrl: null,
  coverObjectPositionDesktop: null,
  coverObjectPositionMobile: null,
  heroUrl: null,
  heroObjectPositionDesktop: null,
  heroObjectPositionMobile: null,
  authorName: null,
  translations: {
    EN: EMPTY_TRANSLATION("EN"),
    NL: EMPTY_TRANSLATION("NL"),
    FR: EMPTY_TRANSLATION("FR"),
    RU: EMPTY_TRANSLATION("RU"),
  },
};

export function JournalForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: JournalFormInitial;
}) {
  const data = initial ?? EMPTY;
  const action =
    mode === "create" ? createJournalPostAction : updateJournalPostAction;
  const [state, dispatch] = useActionState(action, INITIAL_STATE);
  const err = state.fieldErrors ?? {};

  const [activeLocale, setActiveLocale] = useState<Locale>("EN");
  const [status, setStatus] = useState<PostStatus>(data.status);

  // Refs to every translatable input across all locales — keyed
  // `${locale}.${field}`. The auto-translate button reads EN refs and
  // writes into the target locale's refs. All locale panels are mounted
  // (just hidden via CSS) so EN refs are always available.
  const inputRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});

  function getEnSource(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of TRANSLATABLE_FIELDS) {
      out[f.name] = inputRefs.current[`EN.${f.name}`]?.value ?? "";
    }
    return out;
  }

  function applyTranslations(
    locale: Locale,
    translations: Record<string, string>,
  ) {
    for (const [name, value] of Object.entries(translations)) {
      setNativeInputValue(inputRefs.current[`${locale}.${name}`], value);
    }
  }

  const needsPublishDate = status === "SCHEDULED" || status === "PUBLISHED";

  return (
    <form action={dispatch} className="max-w-3xl space-y-6">
      {mode === "edit" && data.id && (
        <input type="hidden" name="id" value={data.id} />
      )}

      {/* master fields */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Status"
          hint="Drafts stay hidden. Scheduled posts appear at the date below."
          error={err.status?.[0]}
        >
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PostStatus)}
            className="input"
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="SCHEDULED">Scheduled</option>
          </select>
        </Field>

        <Field
          label={
            status === "SCHEDULED"
              ? "Publish at (future)"
              : "Published at"
          }
          hint={
            status === "DRAFT"
              ? "Ignored while status is Draft."
              : status === "SCHEDULED"
              ? "Required — must be in the future."
              : "Leave blank to publish now."
          }
          error={err.publishedAt?.[0]}
        >
          <input
            name="publishedAt"
            type="datetime-local"
            defaultValue={toLocalInput(data.publishedAt)}
            disabled={!needsPublishDate}
            className="input disabled:bg-ink/5 disabled:text-ink-mid"
          />
        </Field>

        <Field label="Author name" hint="Shown below the title.">
          <input
            name="authorName"
            defaultValue={data.authorName ?? ""}
            className="input"
            placeholder="an admin"
            maxLength={120}
          />
        </Field>
      </div>

      <Field
        label="Card thumbnail URL (4:5 portrait)"
        hint="Shown on the /journal listing and homepage teaser. Upload at ~1200×1500. Paste a URL from /admin/media."
        error={err.coverUrl?.[0]}
      >
        <input
          name="coverUrl"
          defaultValue={data.coverUrl ?? ""}
          className="input"
          placeholder="https://…"
          maxLength={2000}
        />
      </Field>

      {/* Cover image focal-point picker. Reuses the same FocalPointPicker
          driving the popups + hero video. Form-field names are
          customised so the action sees coverObjectPosition* and not the
          generic imageObjectPosition* names. Picker renders the empty
          placeholder when no coverUrl is set yet — the hidden inputs
          still submit so the saved focal-point survives. */}
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-label text-ink-mid">
          Card thumbnail focus point
        </div>
        <FocalPointPicker
          imageUrl={data.coverUrl ?? ""}
          initialDesktop={data.coverObjectPositionDesktop ?? "center"}
          initialMobile={data.coverObjectPositionMobile ?? "center"}
          desktopFieldName="coverObjectPositionDesktop"
          mobileFieldName="coverObjectPositionMobile"
        />
      </div>

      <Field
        label="Article hero URL (16:9 landscape, optional)"
        hint="Shown full-width at the top of the article page. Upload at ~1600×900. Leave blank to reuse the card thumbnail."
        error={err.heroUrl?.[0]}
      >
        <input
          name="heroUrl"
          defaultValue={data.heroUrl ?? ""}
          className="input"
          placeholder="https://…"
          maxLength={2000}
        />
      </Field>

      {/* Article hero focal-point picker. Same component, distinct
          field names. When heroUrl is blank the picker shows its
          empty state (the article hero falls back to coverUrl, in
          which case the cover's focal points are what matters). */}
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-label text-ink-mid">
          Article hero focus point
        </div>
        <FocalPointPicker
          imageUrl={data.heroUrl ?? ""}
          initialDesktop={data.heroObjectPositionDesktop ?? "center"}
          initialMobile={data.heroObjectPositionMobile ?? "center"}
          desktopFieldName="heroObjectPositionDesktop"
          mobileFieldName="heroObjectPositionMobile"
        />
      </div>

      {/* per-locale copy */}
      <div className="space-y-3 border-t border-ink/10 pt-6">
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          Copy · by language
        </div>
        <div className="flex flex-wrap gap-1 border-b border-ink/10">
          {LOCALES.map((l) => {
            const on = activeLocale === l;
            const filled =
              data.translations[l]?.title.trim().length > 0;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLocale(l)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-[12px] uppercase tracking-label transition-colors",
                  on
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {l}
                {l === "EN" && <span className="ml-1 text-vermilion">*</span>}
                {l !== "EN" && !filled && (
                  <span
                    className="ml-1 inline-block h-1 w-1 rounded-full bg-ink-mid/40"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {LOCALES.map((l) => {
          const t = data.translations[l];
          const on = activeLocale === l;
          return (
            <div
              key={l}
              className={on ? "space-y-3" : "hidden"}
              aria-hidden={!on}
            >
              {/* Auto-translate button on every non-EN tab. Reads EN refs
                  live (no save needed first — all locale panels are
                  mounted, just hidden via CSS). */}
              {l !== "EN" && (
                <TranslateFromEnglishButton
                  targetLocale={l}
                  fields={TRANSLATABLE_FIELDS.map((f) => ({
                    name: f.name,
                    isHtml: f.isHtml,
                    currentValue:
                      inputRefs.current[`${l}.${f.name}`]?.value ??
                      (t[f.name] ?? ""),
                  }))}
                  getSource={getEnSource}
                  onTranslated={(tr) => applyTranslations(l, tr)}
                />
              )}

              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <Field
                  label={l === "EN" ? "Title (required)" : "Title"}
                  hint={
                    l === "EN"
                      ? "Shown as the post headline."
                      : `${l} — falls back to EN if blank.`
                  }
                  error={err[`translations.${l}.title`]?.[0]}
                >
                  <input
                    ref={(el) => {
                      inputRefs.current[`${l}.title`] = el;
                    }}
                    name={`translations.${l}.title`}
                    defaultValue={t.title}
                    className="input"
                    maxLength={200}
                  />
                </Field>
                <Field
                  label="Slug"
                  hint="Auto-filled from the title if left blank."
                  error={err[`translations.${l}.slug`]?.[0]}
                >
                  <input
                    name={`translations.${l}.slug`}
                    defaultValue={t.slug}
                    className="input font-mono tracking-label"
                    maxLength={200}
                    placeholder="lowercase-with-hyphens"
                  />
                </Field>
              </div>

              <Field
                label="Excerpt"
                hint="One or two lines shown on the journal index and in metadata."
              >
                <textarea
                  ref={(el) => {
                    inputRefs.current[`${l}.excerpt`] = el;
                  }}
                  name={`translations.${l}.excerpt`}
                  defaultValue={t.excerpt}
                  rows={2}
                  className="input"
                  maxLength={400}
                />
              </Field>

              <Field
                label={l === "EN" ? "Body (required)" : "Body"}
                hint="HTML is supported (<p>, <h2>, <strong>, <ul>, <img>…). A WYSIWYG editor is coming."
                error={err[`translations.${l}.body`]?.[0]}
              >
                <textarea
                  ref={(el) => {
                    inputRefs.current[`${l}.body`] = el;
                  }}
                  name={`translations.${l}.body`}
                  defaultValue={t.body}
                  rows={14}
                  className="input font-mono text-[12px] leading-relaxed"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="SEO title" hint="Falls back to the post title.">
                  <input
                    ref={(el) => {
                      inputRefs.current[`${l}.seoTitle`] = el;
                    }}
                    name={`translations.${l}.seoTitle`}
                    defaultValue={t.seoTitle}
                    className="input"
                    maxLength={160}
                  />
                </Field>
                <Field
                  label="SEO description"
                  hint="Shown in Google search results."
                >
                  <input
                    ref={(el) => {
                      inputRefs.current[`${l}.seoDescription`] = el;
                    }}
                    name={`translations.${l}.seoDescription`}
                    defaultValue={t.seoDescription}
                    className="input"
                    maxLength={300}
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}

function toLocalInput(d: Date | null): string {
  if (!d) return "";
  // datetime-local wants "YYYY-MM-DDTHH:MM" in local time.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}
