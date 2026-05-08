// ─────────────────────────────────────────────────────────────────────────
// BrandTrustForm — edits the brand About page's trust signals PER LOCALE
// (EN / NL / FR / RU):
//   · Certifications grid (CPNP, ECAS, GMP, etc.)
//   · Safety / usage callout (pregnancy notes, sensitivity advice, etc.)
//
// Mirrors the BrandForm tabs+DeepL pattern so an admin authors EN once
// and clicks "Translate from English" to fill NL/FR/RU. The translate
// helper preserves the `CODE | description` line format because DeepL
// leaves all-caps acronyms (CPNP/ECAS/GMP) untouched and respects the
// pipe separator.
//
// Submits via setBrandTrustAction (narrow action) so an empty submit
// can't accidentally clobber translations or other brand fields.
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

export type BrandTrustLocaleInitial = {
  certifications: BrandCertificationInitial[];
  safetyNote: string | null;
};

/** Convert the structured certifications array back to the textarea
 *  wire format so the editor sees what was saved. Round-trip stays
 *  lossless because the server parser accepts the same format it
 *  just produced. */
function certsToText(certs: BrandCertificationInitial[]): string {
  return certs
    .map((c) =>
      c.description ? `${c.code} | ${c.description}` : c.code,
    )
    .join("\n");
}

export function BrandTrustForm({
  brandId,
  initialByLocale,
}: {
  brandId: string;
  initialByLocale: Partial<Record<Locale, BrandTrustLocaleInitial>>;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setBrandTrustAction, INITIAL);
  const [, startRefresh] = useTransition();
  const [active, setActive] = useState<Locale>(Locale.EN);

  // We track each per-locale textarea via a ref so the DeepL button
  // can grab the freshest EN values without forcing the form to
  // become controlled (controlled textareas + form action have
  // historically had focus + selection bugs in this project).
  const inputRefs = useRef<
    Record<string, HTMLTextAreaElement | null>
  >({});

  function getEnSource(): Record<string, string> {
    return {
      certifications:
        inputRefs.current[`EN.certifications`]?.value ?? "",
      safetyNote: inputRefs.current[`EN.safetyNote`]?.value ?? "",
    };
  }

  function applyTranslations(
    locale: Locale,
    translations: Record<string, string>,
  ) {
    for (const [name, value] of Object.entries(translations)) {
      setNativeInputValue(inputRefs.current[`${locale}.${name}`], value);
    }
  }

  return (
    <form
      action={(fd) => {
        action(fd);
        startRefresh(() => router.refresh());
      }}
      className="space-y-6"
    >
      <input type="hidden" name="id" value={brandId} />

      {/* ── Locale tabs ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-ink/10">
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

      {/* ── Locale panes ───────────────────────────────────────── */}
      {LOCALES.map((l) => {
        const initial = initialByLocale[l] ?? {
          certifications: [],
          safetyNote: null,
        };
        return (
          <div
            key={l}
            className={cn("space-y-5 pt-4", active !== l && "hidden")}
          >
            {l !== Locale.EN && (
              <TranslateFromEnglishButton
                targetLocale={l}
                fields={[
                  {
                    name: "certifications",
                    isHtml: false,
                    currentValue:
                      inputRefs.current[`${l}.certifications`]?.value ??
                      certsToText(initial.certifications),
                  },
                  {
                    name: "safetyNote",
                    isHtml: false,
                    currentValue:
                      inputRefs.current[`${l}.safetyNote`]?.value ??
                      (initial.safetyNote ?? ""),
                  },
                ]}
                getSource={getEnSource}
                onTranslated={(tr) => applyTranslations(l, tr)}
              />
            )}

            {/* ── Certifications ──────────────────────────────── */}
            <div>
              <label
                htmlFor={`certifications-${brandId}-${l}`}
                className="block text-[11px] uppercase tracking-label text-ink-mid"
              >
                Certifications
              </label>
              <textarea
                ref={(el) => {
                  inputRefs.current[`${l}.certifications`] = el;
                }}
                id={`certifications-${brandId}-${l}`}
                name={`translations.${l}.certifications`}
                rows={6}
                defaultValue={certsToText(initial.certifications)}
                placeholder={
                  l === Locale.EN
                    ? `CPNP | EU Cosmetic Notification\nECAS | Emirates Conformity Assessment Scheme\nGMP | Good Manufacturing Practice`
                    : `Translate from English with the button above, or author manually.`
                }
                className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
              />
              <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-mid">
                One per line. Format:{" "}
                <code className="font-mono">CODE | description</code>.
                Codes (CPNP, ECAS, GMP) stay the same across locales —
                only the description gets translated.
              </p>
            </div>

            {/* ── Safety note ────────────────────────────────── */}
            <div>
              <label
                htmlFor={`safety-${brandId}-${l}`}
                className="block text-[11px] uppercase tracking-label text-ink-mid"
              >
                Safety / usage note
              </label>
              <textarea
                ref={(el) => {
                  inputRefs.current[`${l}.safetyNote`] = el;
                }}
                id={`safety-${brandId}-${l}`}
                name={`translations.${l}.safetyNote`}
                rows={5}
                defaultValue={initial.safetyNote ?? ""}
                placeholder={
                  l === Locale.EN
                    ? "e.g. During pregnancy and breastfeeding, skin can become more sensitive — we advise consulting a healthcare professional before introducing any new skincare into your routine."
                    : "Translate from English with the button above, or author manually."
                }
                className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
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
