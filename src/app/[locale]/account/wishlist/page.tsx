// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/wishlist — saved products.
//
// A grid of product cards — image, brand, name, price, "remove" form and
// a link through to the PDP. Empty state sends them to the shop.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { listMyWishlist } from "@/lib/queries/wishlist";
import { removeWishlistFormAction } from "@/lib/wishlist/actions";
import { formatEur, priceLocale } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

export default async function WishlistPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/wishlist",
  });

  const t = await getTranslations("account");
  const items = await listMyWishlist(profile.id, locale);

  const euro = (v: number) => formatEur(v, priceLocale(locale));

  return (
    <section>
      <div className="eyebrow">{t("eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {t("wishlist_title")}
      </h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
        {t("wishlist_lede")}
      </p>

      <div className="rule my-10" />

      {items.length === 0 ? (
        <div className="border border-ink/10 bg-white/50 px-8 py-14 text-center">
          <div className="eyebrow">{t("wishlist_empty_eyebrow")}</div>
          <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
            {t("wishlist_empty_title")}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
            {t("wishlist_empty_body")}
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion leading-[2.75rem]"
          >
            {t("wishlist_empty_cta")}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="group flex flex-col border border-ink/10 bg-white/50"
            >
              <Link
                href={it.productSlug ? `/shop/${it.productSlug}` : "/shop"}
                className="block aspect-[4/5] w-full overflow-hidden bg-rice/40"
              >
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.productName}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : null}
              </Link>
              <div className="flex flex-1 flex-col p-5">
                {it.brandName && (
                  <div className="eyebrow text-ink-mid">{it.brandName}</div>
                )}
                <div className="mt-1 font-display text-[16px] leading-tight text-ink">
                  <Link
                    href={it.productSlug ? `/shop/${it.productSlug}` : "/shop"}
                    className="transition-colors hover:text-vermilion"
                  >
                    {it.productName}
                  </Link>
                </div>
                {it.volumeMl && (
                  <div className="mt-0.5 text-[12px] text-ink-mid">
                    {it.volumeMl} ml
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-[16px] text-ink">
                      {euro(it.comparePrice ?? it.price)}
                    </span>
                    {it.comparePrice && (
                      <span className="text-[12px] text-ink-mid line-through">
                        {euro(it.price)}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4">
                    <Link
                      href={
                        it.productSlug ? `/shop/${it.productSlug}` : "/shop"
                      }
                      className="text-[11px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                    >
                      {t("wishlist_view")}
                    </Link>
                    <form action={removeWishlistFormAction}>
                      <input
                        type="hidden"
                        name="productId"
                        value={it.productId}
                      />
                      <input type="hidden" name="locale" value={locale} />
                      <button
                        type="submit"
                        className="text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
                      >
                        {t("wishlist_remove")}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
