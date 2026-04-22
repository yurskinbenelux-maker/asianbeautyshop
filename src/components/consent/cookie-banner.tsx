// ─────────────────────────────────────────────────────────────────────────
// Cookie consent banner.
//
// UX model:
//   · First visit → banner appears from the bottom after a short delay.
//   · Two primary CTAs: "Accept all" and "Only necessary".
//   · A "Customise" link flips the banner into a panel with per-category
//     toggles (analytics, marketing) + "Save preferences".
//   · After any decision the banner slides out and writes the cookie +
//     ConsentLog via the server action.
//
// Re-opening: a "Cookie preferences" link in the footer fires a
// `yur:open-consent` CustomEvent that this component listens for.
//
// Implementation notes:
//   · We take the current cookie state from the server as `initialHasConsent`
//     so we don't flash the banner on re-visits (SSR hides it immediately).
//   · We still re-check document.cookie on mount as a safety net — e.g. if
//     the user cleared cookies between the RSC render and hydration.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { recordConsentAction } from "@/lib/consent/actions";
import { CONSENT_COOKIE } from "@/lib/consent/types";

/** Client-side cookie sniff. We only need to know if the cookie *exists*
 *  (any valid consent record hides the banner), not its contents — those
 *  live server-side. Re-declared here so this file has zero imports from
 *  the server-only helpers. */
function hasConsentCookie(): boolean {
  if (typeof document === "undefined") return false;
  const name = `${CONSENT_COOKIE}=`;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(name));
}

type Panel = "primary" | "customise";

export function CookieBanner({
  initialHasConsent,
}: {
  /** True when the SSR read found an existing consent cookie. Used so we
   *  don't render (and then hide) the banner during hydration. */
  initialHasConsent: boolean;
}) {
  const t = useTranslations("consent");
  const [visible, setVisible] = useState(!initialHasConsent);
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<Panel>("primary");
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Double-check the cookie on mount. Covers the "user cleared cookies in
  // DevTools mid-session" edge case where SSR and client disagree.
  useEffect(() => {
    setMounted(true);
    if (hasConsentCookie()) {
      setVisible(false);
    }
  }, []);

  // Listen for the "re-open" event fired by the footer link.
  useEffect(() => {
    const onOpen = () => {
      setPanel("primary");
      setVisible(true);
      // Move focus into the banner for keyboard users. Delay by one frame
      // so the element exists in the DOM.
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    };
    window.addEventListener("yur:open-consent", onOpen);
    return () => window.removeEventListener("yur:open-consent", onOpen);
  }, []);

  // When the customise panel is open, let Esc cancel back to the primary
  // view rather than trapping the user. The Accept/Reject buttons are still
  // the fast path for most visitors.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panel === "customise") {
        e.preventDefault();
        setPanel("primary");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, panel]);

  if (!mounted || !visible) return null;

  const submit = (choice: { analytics: boolean; marketing: boolean }) => {
    startTransition(async () => {
      const result = await recordConsentAction(choice);
      if (result.ok) {
        setVisible(false);
      }
      // If the server rejected the call we stay open silently — the user
      // can try again. We don't toast-error here because the banner is
      // already a visible surface and a nested toast would be noisy.
    });
  };

  return (
    <div
      // aria-live="polite" so screen readers announce this when it opens,
      // but it's not a modal — the page behind stays interactive. GDPR
      // doesn't require a modal, and modals annoy people.
      role="region"
      aria-label={t("region_label")}
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 md:px-6 md:pb-6",
        "animate-[slide-up_300ms_ease-out]",
      )}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "w-full max-w-3xl bg-ink text-rice shadow-[0_24px_60px_-20px_rgba(18,17,16,0.45)]",
          "outline-none",
        )}
      >
        {/* hairline vermilion accent on the top edge — ties to brand */}
        <div className="h-[2px] w-full bg-vermilion/80" />

        <div className="px-6 py-6 md:px-8 md:py-7">
          {panel === "primary" ? (
            <>
              <div className="eyebrow text-rice/70">{t("eyebrow")}</div>
              <h2 className="mt-3 font-display text-[22px] leading-tight text-rice md:text-[26px]">
                {t("title")}
              </h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-rice/80">
                {t("lede")}{" "}
                <Link
                  href="/legal/cookies"
                  className="underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                >
                  {t("read_policy")}
                </Link>
              </p>

              <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <button
                  type="button"
                  onClick={() => setPanel("customise")}
                  className="text-[12px] uppercase tracking-label text-rice/70 underline decoration-rice/40 underline-offset-4 transition-colors hover:text-rice"
                >
                  {t("customise")}
                </button>

                <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                  <BannerButton
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      submit({ analytics: false, marketing: false })
                    }
                  >
                    {t("reject_non_essential")}
                  </BannerButton>
                  <BannerButton
                    variant="primary"
                    disabled={isPending}
                    onClick={() => submit({ analytics: true, marketing: true })}
                  >
                    {t("accept_all")}
                  </BannerButton>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="eyebrow text-rice/70">{t("eyebrow")}</div>
                  <h2 className="mt-3 font-display text-[22px] leading-tight text-rice md:text-[26px]">
                    {t("customise_title")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel("primary")}
                  className="text-[11px] uppercase tracking-label text-rice/60 underline decoration-rice/30 underline-offset-4 transition-colors hover:text-rice"
                >
                  {t("back")}
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {/* Necessary — always on, shown as disabled/locked. */}
                <CategoryRow
                  label={t("cat.necessary.label")}
                  description={t("cat.necessary.description")}
                  checked={true}
                  disabled
                  onChange={() => {}}
                />
                <CategoryRow
                  label={t("cat.analytics.label")}
                  description={t("cat.analytics.description")}
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <CategoryRow
                  label={t("cat.marketing.label")}
                  description={t("cat.marketing.description")}
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                <BannerButton
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    submit({ analytics: false, marketing: false })
                  }
                >
                  {t("reject_non_essential")}
                </BannerButton>
                <BannerButton
                  variant="primary"
                  disabled={isPending}
                  onClick={() => submit({ analytics, marketing })}
                >
                  {t("save_preferences")}
                </BannerButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function BannerButton({
  variant,
  onClick,
  disabled,
  children,
}: {
  variant: "primary" | "ghost";
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center justify-center px-5 text-[12px] uppercase tracking-label transition-colors",
        variant === "primary"
          ? "bg-vermilion text-rice hover:bg-vermilion/90"
          : "border border-rice/30 text-rice hover:border-rice/60",
        disabled && "opacity-60",
      )}
    >
      {children}
    </button>
  );
}

function CategoryRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-t border-rice/10 pt-4">
      <div>
        <div className="text-[13px] font-medium text-rice">{label}</div>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-rice/70">
          {description}
        </p>
      </div>
      {/* Minimal iOS-style toggle, drawn in pure Tailwind. */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-vermilion" : "bg-rice/20",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-rice transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
