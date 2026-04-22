// ─────────────────────────────────────────────────────────────────────────
// Footer — editorial, four columns over a single hairline rule.
// Intentionally minimal: Sofia can extend legal links via admin later.
//
// Admin-editable copy: `tagline` (the line under YU.R) and `rights` (the
// small © line on the right). Both are part of the `footer` SiteCopy
// section; everything else in the footer is UI chrome that stays in the
// messages catalogue.
// ─────────────────────────────────────────────────────────────────────────
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { MaehwaBranch } from "@/components/home/maehwa-branch";
import { CookiePreferencesLink } from "@/components/consent/cookie-preferences-link";
import { getSiteCopy } from "@/lib/queries/site-copy";

export async function Footer() {
  const locale = await getLocale();
  const [t, tBrand, copy] = await Promise.all([
    getTranslations(),
    getTranslations("brand"),
    getSiteCopy(locale, ["footer"]),
  ]);

  const year = new Date().getFullYear();

  // SiteCopy override > JSON fallback. The JSON paths are brand.tagline
  // (historical reason — the catalogue groups it with the masthead) and
  // footer.rights; the SiteCopy "footer" section flattens both under one
  // editable surface in /admin/homepage.
  const tagline = copy["footer"]?.tagline ?? tBrand("tagline");
  const rights = copy["footer"]?.rights ?? t("footer.rights");

  return (
    <footer className="relative mt-32 border-t border-ink/10 bg-rice-dim/40 pt-20 pb-10">
      {/* decorative branch in the top corner */}
      <div className="pointer-events-none absolute left-0 top-0 h-40 w-64 opacity-30">
        <MaehwaBranch />
      </div>

      <div className="container">
        {/* ── masthead ─────────────────────────────────────────── */}
        <div className="mb-16 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-display text-[28px] leading-none text-ink">YU.R</div>
            <div className="mt-2 text-[13px] text-ink-mid">{tagline}</div>
          </div>
          <div className="font-kr text-[20px] text-ink-mid">{t("brand.mark")}</div>
        </div>

        {/* ── columns ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <FooterCol title={t("footer.shop")}>
            <FooterLink href="/shop">{t("nav.shop")}</FooterLink>
            <FooterLink href="/rituals">{t("nav.rituals")}</FooterLink>
            <FooterLink href="/ingredients">{t("nav.ingredients")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.about")}>
            <FooterLink href="/about">{t("nav.about")}</FooterLink>
            <FooterLink href="/journal">{t("nav.journal")}</FooterLink>
            <FooterLink href="/contact">{t("footer.contact")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.help")}>
            <FooterLink href="/shipping">{t("footer.shipping")}</FooterLink>
            <FooterLink href="/legal/returns">{t("footer.returns")}</FooterLink>
            <FooterLink href="/faq">FAQ</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.legal")}>
            <FooterLink href="/legal/privacy">{t("footer.privacy")}</FooterLink>
            <FooterLink href="/legal/terms">{t("footer.terms")}</FooterLink>
            <FooterLink href="/legal/cookies">{t("footer.cookies")}</FooterLink>
            <FooterLink href="/legal/imprint">{t("footer.imprint")}</FooterLink>
            <li>
              {/* Re-opens the consent banner. Lives in the legal column so
                  visitors who want to change their mind know where to look. */}
              <CookiePreferencesLink />
            </li>
          </FooterCol>
        </div>

        {/* ── rule + meta ──────────────────────────────────────── */}
        <div className="mt-16 rule" />
        <div className="mt-6 flex flex-col gap-3 text-[11px] uppercase tracking-caps text-ink-mid md:flex-row md:items-center md:justify-between">
          <div>© {year} K'Elmus Group BV · Boomsesteenweg 41/4b, 2630 Aartselaar, BE</div>
          <div>{rights}</div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="eyebrow mb-4">{title}</div>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="text-[14px] text-ink transition-colors hover:text-vermilion"
      >
        {children}
      </Link>
    </li>
  );
}
