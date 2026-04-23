// ─────────────────────────────────────────────────────────────────────────
// SkipLink — WCAG 2.4.1 bypass-blocks control.
//
// Visually hidden until focused (Tab on a cold page load surfaces it
// first). Clicking / hitting Enter jumps to the element with `id="main"`
// in the layout, skipping the whole nav + locale switcher + cart button
// sequence. Matches the editorial aesthetic: ink on rice, hairline
// border, vermilion focus underline.
//
// Server component — no state, no effects.
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";

export async function SkipLink() {
  const t = await getTranslations("a11y");
  return (
    <a
      href="#main"
      className="
        sr-only
        focus:not-sr-only
        focus:fixed focus:left-4 focus:top-4 focus:z-[100]
        focus:inline-flex focus:items-center
        focus:border focus:border-ink focus:bg-rice
        focus:px-4 focus:py-2
        focus:font-display focus:text-[13px] focus:text-ink
        focus:underline focus:decoration-vermilion focus:underline-offset-4
        focus:outline-none
      "
    >
      {t("skip_to_content")}
    </a>
  );
}
