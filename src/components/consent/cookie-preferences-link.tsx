// ─────────────────────────────────────────────────────────────────────────
// CookiePreferencesLink — tiny client component that re-opens the consent
// banner. We use a CustomEvent rather than shared React state because the
// footer lives outside the banner's parent, and lifting state up into the
// layout would cascade into client-component propagation everywhere.
//
// A CustomEvent is decoupled, zero-dependency, and trivial to wire.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useTranslations } from "next-intl";

export function CookiePreferencesLink() {
  const t = useTranslations("consent");
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("yur:open-consent"));
      }}
      className="text-[14px] text-ink transition-colors hover:text-vermilion"
    >
      {t("preferences_link")}
    </button>
  );
}
