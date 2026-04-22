// ─────────────────────────────────────────────────────────────────────────
// Shown when MOLLIE_API_KEY isn't configured on the server. Keeps the site
// from serving a 500 during the brief window between deploy and "Sofia has
// pasted her key in Hostinger".
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";

export async function CheckoutUnavailable({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "checkout" });
  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-20 text-center md:px-10">
      <div className="eyebrow">{t("unavailable_eyebrow")}</div>
      <h1 className="mt-4 font-display text-display-md leading-tight text-ink">
        {t("unavailable_title")}
      </h1>
      <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-ink-mid">
        {t("unavailable_lede")}
      </p>
      <Link
        href="/cart"
        className="mt-8 inline-block h-12 bg-ink px-6 text-[12px] uppercase tracking-label leading-[3rem] text-rice transition-colors hover:bg-vermilion"
      >
        {t("unavailable_cta")}
      </Link>
    </section>
  );
}
