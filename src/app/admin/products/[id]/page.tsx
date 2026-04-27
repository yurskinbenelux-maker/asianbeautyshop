// ─────────────────────────────────────────────────────────────────────────
// /admin/products/[id] — the editor.
//
// Tabs: Basics · Translations · Media (coming) · Organise (coming).
// Tab state lives in the URL (?tab=…) so:
//   • no client JS needed just to switch panels
//   • bookmarks/links are durable
//   • hitting "Save" inside a tab leaves you on the same tab
//
// Each tab renders its own form that posts to its own Server Action —
// short diffs, clearer error recovery.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, Eye, Trash2 } from "lucide-react";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { duplicateProduct, softDeleteProduct } from "../actions";
import { BasicsForm } from "@/components/admin/products/basics-form";
import { TranslationsForm } from "@/components/admin/products/translations-form";
import { MediaManager } from "@/components/admin/products/media-manager";
import {
  OrganiseForm,
  type TaxonomyOption,
} from "@/components/admin/products/organise-form";
import { InventoryPanel } from "@/components/admin/products/inventory-panel";
import { listProductMovements } from "@/lib/inventory/db";
import { PRODUCT_LINES } from "@/lib/queries/products";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string }>;

type TabKey = "basics" | "translations" | "media" | "organise" | "inventory";

const TABS: { key: TabKey; label: string; disabled?: boolean }[] = [
  { key: "basics", label: "Basics" },
  { key: "translations", label: "Translations" },
  { key: "media", label: "Media" },
  { key: "organise", label: "Organise" },
  { key: "inventory", label: "Inventory" },
];

export default async function ProductEditPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: TabKey =
    rawTab === "translations"
      ? "translations"
      : rawTab === "media"
        ? "media"
        : rawTab === "organise"
          ? "organise"
          : rawTab === "inventory"
            ? "inventory"
            : "basics";

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      translations: {
        orderBy: { locale: "asc" },
      },
      media: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          url: true,
          alt: true,
          isPrimary: true,
          sortOrder: true,
        },
      },
      // Organise tab — we only need the IDs of currently linked items,
      // everything else is fetched from the taxonomy tables below.
      categories: { select: { categoryId: true } },
      skinTypes: { select: { skinTypeId: true } },
      concerns: { select: { concernId: true } },
      benefits: { select: { benefitId: true } },
      ingredients: { select: { ingredientId: true } },
      // Inventory tab — list + stock per variant, ordered by sortOrder
      // so Sofia sees them in the same order the PDP shows them.
      // price/comparePrice are needed so the Edit form can pre-populate
      // the inputs with current overrides.
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sku: true,
          label: true,
          stock: true,
          isDefault: true,
          price: true,
          comparePrice: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!product || product.deletedAt) {
    notFound();
  }

  // Fetch the full taxonomy option lists (for the Organise tab). Done on
  // every load of the edit page but only actually rendered when tab=organise.
  // Tiny tables, cheap query — simpler than conditionally fetching.
  const [
    allCategories,
    allSkinTypes,
    allConcerns,
    allBenefits,
    allIngredients,
  ] = await Promise.all([
    prisma.category.findMany({
      include: {
        translations: { where: { locale: Locale.EN }, select: { name: true } },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.skinType.findMany({
      include: {
        translations: { where: { locale: Locale.EN }, select: { label: true } },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.concern.findMany({
      include: {
        translations: { where: { locale: Locale.EN }, select: { label: true } },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.benefit.findMany({
      include: {
        translations: { where: { locale: Locale.EN }, select: { label: true } },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.ingredient.findMany({
      include: {
        translations: {
          where: { locale: Locale.EN },
          select: { displayName: true },
        },
      },
      orderBy: { inciName: "asc" },
    }),
  ]);

  // Normalise to the TaxonomyOption shape the form expects.
  const categoryOptions: TaxonomyOption[] = allCategories.map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.translations[0]?.name ?? c.slug,
  }));
  const skinTypeOptions: TaxonomyOption[] = allSkinTypes.map((s) => ({
    id: s.id,
    slug: s.slug,
    label: s.translations[0]?.label ?? s.slug,
  }));
  const concernOptions: TaxonomyOption[] = allConcerns.map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.translations[0]?.label ?? c.slug,
  }));
  const benefitOptions: TaxonomyOption[] = allBenefits.map((b) => ({
    id: b.id,
    slug: b.slug,
    label: b.translations[0]?.label ?? b.slug,
  }));
  const ingredientOptions: TaxonomyOption[] = allIngredients.map((i) => ({
    id: i.id,
    slug: i.slug,
    label: i.translations[0]?.displayName ?? i.inciName,
  }));

  // Inventory timeline — only fetch when the tab is active. 200-row cap
  // is enforced inside listProductMovements.
  const movements =
    tab === "inventory" ? await listProductMovements(product.id) : [];

  const enTranslation = product.translations.find((t) => t.locale === "EN");
  const titleForHeader = enTranslation?.name ?? "Untitled product";

  // For the Preview/View-live URL we prefer the EN slug, falling back to
  // the first translation that has one. A draft might be half-translated,
  // and we want Preview to work even when EN isn't filled in yet.
  const previewTranslation =
    (enTranslation?.slug ? enTranslation : undefined) ??
    product.translations.find((t) => t.slug);
  const previewLocale = previewTranslation?.locale.toLowerCase() ?? null;
  const previewSlug = previewTranslation?.slug ?? null;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      {/* back link */}
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All products
      </Link>

      {/* masthead */}
      <header className="mt-6 flex flex-wrap items-start justify-between gap-6 border-b border-ink/10 pb-6">
        <div className="min-w-0">
          <div className="eyebrow">Editing</div>
          <h1 className="mt-2 truncate font-display text-[30px] leading-tight text-ink">
            {titleForHeader}
          </h1>
          <div className="mt-1 font-mono text-[12px] text-ink-mid">
            {product.sku}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {product.status === "PUBLISHED" && previewLocale && previewSlug && (
            <a
              href={`/${previewLocale}/shop/${previewSlug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View live
            </a>
          )}

          {/*
            Preview as customer — opens the PDP with ?preview=1. The PDP route
            verifies the visitor is an admin before unlocking DRAFT/ARCHIVED
            products, so the URL itself isn't a leak. Lets Sofia QA how a
            draft product will look (gallery, ritual steps, bundle suggestions,
            real reviews) before flipping status to PUBLISHED.

            Only shown for DRAFT/ARCHIVED AND when at least one locale has a
            slug (a fresh draft might have none yet — no slug = no route to
            preview). When PUBLISHED, "View live" above already goes straight
            to the real page.
          */}
          {product.status !== "PUBLISHED" &&
            previewLocale &&
            previewSlug && (
              <a
                href={`/${previewLocale}/shop/${previewSlug}?preview=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
                title="Open the customer-facing page in a new tab — only you can see it"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </a>
            )}

          {/*
            Duplicate — clone this product (as DRAFT) and drop Sofia into the
            editor for the copy. Massive time-saver when she's adding a new
            product that's only a small variation of an existing one.
          */}
          <form action={duplicateProduct}>
            <input type="hidden" name="productId" value={id} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
              aria-label="Duplicate product"
              title="Create a draft copy of this product"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </button>
          </form>

          {/* Soft-delete — full page post, no confirm dialog yet (coming) */}
          <form
            action={async () => {
              "use server";
              await softDeleteProduct(id);
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
              aria-label="Archive product"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Archive
            </button>
          </form>
        </div>
      </header>

      {/* tabs */}
      <nav className="mt-6 flex gap-6 border-b border-ink/10">
        {TABS.map((t) => {
          const active = tab === t.key;
          if (t.disabled) {
            return (
              <span
                key={t.key}
                className="pb-3 text-[12px] uppercase tracking-label text-ink-mid/40"
                title="Coming soon"
              >
                {t.label}
              </span>
            );
          }
          return (
            <Link
              key={t.key}
              href={`/admin/products/${id}?tab=${t.key}`}
              scroll={false}
              className={cn(
                "pb-3 text-[12px] uppercase tracking-label transition-colors",
                active
                  ? "border-b-2 border-ink text-ink"
                  : "text-ink-mid hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* tab body */}
      <div className="mt-8">
        {tab === "basics" && (
          <BasicsForm
            productId={product.id}
            initial={{
              sku: product.sku,
              status: product.status,
              isFeatured: product.isFeatured,
              isBestseller: product.isBestseller,
              isAvailableForAi: product.isAvailableForAi,
              hideFromSearch: product.hideFromSearch,
              price: Number(product.price).toFixed(2),
              comparePrice:
                product.comparePrice === null
                  ? ""
                  : Number(product.comparePrice).toFixed(2),
              volumeMl: product.volumeMl?.toString() ?? "",
              weightGrams: product.weightGrams?.toString() ?? "",
              // Supplier-spec fields. Empty strings (not null) so the
              // input defaultValues stay controlled-friendly.
              productLine: product.productLine ?? "",
              barcode: product.barcode ?? "",
              shelfLifeMonths: product.shelfLifeMonths?.toString() ?? "",
              originCountry: product.originCountry ?? "",
              hsCode: product.hsCode ?? "",
              audienceCategory: product.audienceCategory,
              inciList: product.inciList ?? "",
            }}
          />
        )}

        {tab === "translations" && (
          <TranslationsForm
            productId={product.id}
            translations={LOCALES.map((locale) => {
              const t = product.translations.find((x) => x.locale === locale);
              return {
                locale,
                name: t?.name ?? "",
                slug: t?.slug ?? "",
                shortDescription: t?.shortDescription ?? "",
                description: t?.description ?? "",
                howToUse: t?.howToUse ?? "",
                warnings: t?.warnings ?? "",
                seoTitle: t?.seoTitle ?? "",
                seoDescription: t?.seoDescription ?? "",
              };
            })}
          />
        )}

        {tab === "media" && (
          <MediaManager productId={product.id} media={product.media} />
        )}

        {tab === "organise" && (
          <OrganiseForm
            productId={product.id}
            initial={{
              // Resolve the stored productLine string back to a slug so
              // the picker can highlight the right radio. Anything we
              // don't recognise falls back to the default Yu•R line —
              // safer than crashing the editor on a stale value.
              productLineSlug:
                PRODUCT_LINES.find((l) =>
                  (l.dbValues as readonly (string | null)[]).includes(
                    product.productLine,
                  ),
                )?.slug ?? "yur",
              categoryIds: product.categories.map((x) => x.categoryId),
              skinTypeIds: product.skinTypes.map((x) => x.skinTypeId),
              concernIds: product.concerns.map((x) => x.concernId),
              benefitIds: product.benefits.map((x) => x.benefitId),
              ingredientIds: product.ingredients.map((x) => x.ingredientId),
            }}
            options={{
              categories: categoryOptions,
              skinTypes: skinTypeOptions,
              concerns: concernOptions,
              benefits: benefitOptions,
              ingredients: ingredientOptions,
            }}
          />
        )}

        {tab === "inventory" && (
          <InventoryPanel
            productId={product.id}
            // Product price as a Decimal-safe string — shown in the
            // "Add variant" form's price placeholder so Sofia knows
            // what blank inherits to.
            productPrice={Number(product.price).toFixed(2)}
            variants={product.variants.map((v) => ({
              id: v.id,
              sku: v.sku,
              label: v.label,
              stock: v.stock,
              isDefault: v.isDefault,
              // Decimal-safe strings; "" means "no override, inherit
              // from Product.price" — matches the form's placeholder.
              price: v.price === null ? "" : Number(v.price).toFixed(2),
              comparePrice:
                v.comparePrice === null ? "" : Number(v.comparePrice).toFixed(2),
              sortOrder: v.sortOrder,
            }))}
            movements={movements}
          />
        )}
      </div>
    </div>
  );
}

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];
