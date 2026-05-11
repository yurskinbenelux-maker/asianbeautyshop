// ─────────────────────────────────────────────────────────────────────────
// BrandTrustForm — edits the brand About page's trust signals.
//
//   · Certifications  — GLOBAL (one textarea, no locale tabs). Codes
//                       like CPNP / ECAS / GMP are universal regulatory
//                       acronyms; their descriptions don't usefully
//                       translate either. Same value renders across
//                       EN/NL/FR/RU.
//
//   · Safety / usage  — PER LOCALE (tabs + DeepL). Customer-facing
//                       prose. The "Translate from English" button
//                       fills NL/FR/RU from the EN source. Codes are
//                       NOT mixed into this batch any more — earlier
//                       versions sent both fields together and DeepL
//                       sometimes choked on the pipe-delimited cert
//                       lines, returning only one of the two fields.
//
// Submits via setBrandTrustAction (narrow action).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { Locale } from "@prisma/client";
import {
  setBrandTrustAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { setNativeInputValue } from "@/lib/admin/native-input";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };
const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

export type BrandCertificationInitial = {
  code: string;
  description: string;
};

/** Convert structured certifications back to the textarea wire format
 *  so the editor sees what was saved. The server parser accepts the
 *  same format it produces — round trip stays lossless. */
function certsToText(certs: BrandCertificationInitial[]): string {
  return certs
    .map((c) =>
      c.description ? `${c.code} | ${c.description}` : c.code,
    )
    .join("\n");
}

export function BrandTrustForm({
  brandId,
  initialCertifications,
  initialSafetyByLocale,
}: {
  brandId: string;
  /** Single global value rendered in EN/NL/FR/RU identically. */
  initialCertifications: BrandCertificationInitial[];
  /** Per-locale safety notes; missing locales fall back to empty in the form. */
  initialSafetyByLocale: Partial<Record<Locale, string | null>>;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setBrandTrustAction, INITIAL);
  const [, startRefresh] = useTransition();
  const [active, setActive] = useState<Locale>(Locale.EN);

  // Refs for the per-locale safety note textareas so the DeepL button
  // can grab the live EN value and write back to the target locale.
  const safetyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  function getEnSource(): Record<string, string> {
    return {
      safetyNote: safetyRefs.current[`EN`]?.value ?? "",
    };
  }

  function applyTranslations(
    locale: Locale,
    translations: Record<string, string>,
  ) {
    if (typeof translations.safetyNote === "string") {
      setNativeInputValue(safetyRefs.current[locale], translations.safetyNote);
    }
  }

  return (
    <form
      action={(fd) => {
        action(fd);
        startRefresh(() => router.refresh());
      }}
      className="space-y-8"
    >
      <input type="hidden" name="id" value={brandId} />

      {/* ── Certifications (GLOBAL) ───────────────────────────── */}
      <div>
        <label
          htmlFor={`certifications-${brandId}`}
          className="block text-[11px] uppercase tracking-label text-ink-mid"
        >
          Certifications
        </label>
        <textarea
          id={`certifications-${brandId}`}
          name="certifications"
          rows={6}
          defaultValue={certsToText(initialCertifications)}
          placeholder={`CPNP | EU Cosmetic Notification\nECAS | Emirates Conformity Assessment Scheme\nGMP | Good Manufacturing Practice`}
          className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-mid">
          One per line. Format:{" "}
          <code className="font-mono">CODE | description</code>. Shown
          identically in every language — regulatory acronyms aren&rsquo;t
          translated.
        </p>
      </div>

      {/* ── Safety / usage note (PER LOCALE) ───────────────────── */}
      <div>
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          Safety / usage note
        </div>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-ink-mid">
          Renders as a soft callout box on the brand About page. Author
          in English first, then click <em>Translate from English</em> on
          the NL / FR / RU tabs to auto-fill via DeepL.
        </p>

        {/* Locale tabs */}
        <div className="mt-4 flex items-center gap-1 border-b border-ink/10">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setActive(l)}
              aria-pressed={active === l}
              className={cn(
                "border-b-2 px-3 py-2 text-[11px] uppercase tracking-label transition-colors",
                active === l
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-mid hover:text-ink",
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Locale panes */}
        {LOCALES.map((l) => {
          const initial = initialSafetyByLocale[l] ?? "";
          return (
            <div
              key={l}
              className={cn("space-y-3 pt-4", active !== l && "hidden")}
            >
              {l !== Locale.EN && (
                <TranslateFromEnglishButton
                  targetLocale={l}
                  fields={[
                    {
                      name: "safetyNote",
                      isHtml: false,
                      currentValue:
                        safetyRefs.current[l]?.value ?? (initial ?? ""),
                    },
                  ]}
                  getSource={getEnSource}
                  onTranslated={(tr) => applyTranslations(l, tr)}
                />
              )}

              <textarea
                ref={(el) => {
                  safetyRefs.current[l] = el;
                }}
                name={`translations.${l}.safetyNote`}
                rows={5}
                defaultValue={initial ?? ""}
                placeholder={
                  l === Locale.EN
                    ? "e.g. During pregnancy and breastfeeding, skin can become more sensitive — we advise consulting a healthcare professional before introducing any new skincare into your routine."
                    : "Translate from English with the button above, or author manually."
                }
                className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-ink/10 pt-5">
        <SaveButton />
        {state.message && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px]",
              state.ok ? "text-sage" : "text-vermilion",
            )}
            role="status"
          >
            {state.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {state.ok ? "Saved." : state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Save className="h-3 w-3" />
      )}
      Save trust signals
    </button>
  );
}
