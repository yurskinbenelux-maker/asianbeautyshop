// ─────────────────────────────────────────────────────────────────────────
// UgcSection — "How customers use this" tile grid on the PDP. Server
// component. Hidden when there are zero active photos for this product.
//
// Each tile shows the photo and (optionally) the customer's first name
// + a short caption. Photos open in a lightweight overlay on click —
// just an `<a target="_blank">` for now, no client JS needed.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { getUgcForProduct } from "@/lib/queries/ugc";

export async function UgcSection({
  productId,
}: {
  productId: string;
}) {
  const photos = await getUgcForProduct(productId);
  if (photos.length === 0) return null;

  const t = await getTranslations("product.ugc");

  return (
    <section
      aria-labelledby="ugc-heading"
      className="container mt-20 md:mt-24"
    >
      <header className="mb-8">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h2
          id="ugc-heading"
          className="mt-3 font-display text-display-md leading-tight text-ink md:text-[36px]"
        >
          {t("title")}
        </h2>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {photos.map((photo) => (
          <li key={photo.id}>
            <figure className="group relative block aspect-square overflow-hidden bg-rice-dim">
              <Image
                src={photo.imageUrl}
                alt={
                  photo.caption ??
                  (photo.customerFirstName
                    ? t("alt_with_name", {
                        name: photo.customerFirstName,
                      })
                    : t("alt_default"))
                }
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              {(photo.customerFirstName || photo.caption) && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/40 to-transparent px-3 py-2 text-[11px] uppercase tracking-label text-rice opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {photo.customerFirstName && (
                    <span className="font-display text-[12px] not-italic">
                      {photo.customerFirstName}
                    </span>
                  )}
                  {photo.caption && (
                    <span className="ml-2 normal-case tracking-normal opacity-90">
                      {photo.caption}
                    </span>
                  )}
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
