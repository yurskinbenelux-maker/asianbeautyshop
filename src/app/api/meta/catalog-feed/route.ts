import { NextResponse } from "next/server";
import { Locale, ProductKind, ProductStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_ORIGIN ??
  "https://asianbeautyshop.eu";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";

  const str = String(value)
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (str.includes(",") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function stripHtml(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

function getSalePrice(product: {
  price: unknown;
  isOnSale: boolean;
  salePercent: number | null;
}): number {
  const regularPrice = Number(product.price);

  if (!product.isOnSale || !product.salePercent || product.salePercent <= 0) {
    return regularPrice;
  }

  const percent = Math.min(90, Math.max(0, product.salePercent));
  return Math.round(regularPrice * (1 - percent / 100) * 100) / 100;
}

export async function GET() {
  const products = await prisma.product.findMany({
    where: {
      status: ProductStatus.PUBLISHED,
      deletedAt: null,
      kind: ProductKind.STANDARD,
    },
    orderBy: [{ launchedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      sku: true,
      price: true,
      isOnSale: true,
      salePercent: true,
      barcode: true,
      brand: {
        select: {
          name: true,
        },
      },
      translations: {
        where: {
          locale: {
            in: [Locale.EN],
          },
        },
        select: {
          name: true,
          slug: true,
          shortDescription: true,
          description: true,
        },
        take: 1,
      },
      media: {
        where: {
          kind: "IMAGE",
        },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: {
          url: true,
        },
        take: 1,
      },
      variants: {
        select: {
          stock: true,
        },
      },
      categories: {
        select: {
          category: {
            select: {
              slug: true,
              translations: {
                where: {
                  locale: Locale.EN,
                },
                select: {
                  name: true,
                },
                take: 1,
              },
            },
          },
        },
        take: 1,
      },
    },
  });

  const headers = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
    "google_product_category",
    "fb_product_category",
    "item_group_id",
    "gtin",
    "mpn",
  ];

  const rows = products.map((product) => {
    const translation = product.translations[0];
    const name = translation?.name ?? product.sku;
    const slug = translation?.slug ?? product.sku.toLowerCase();
    const description =
      stripHtml(translation?.shortDescription) ||
      stripHtml(translation?.description) ||
      name;

    const imageUrl = product.media[0]?.url ?? "";
    const productUrl = `${SITE_ORIGIN}/en/shop/${slug}`;

    const hasVariants = product.variants.length > 0;
    const isInStock = hasVariants
      ? product.variants.some((variant) => variant.stock > 0)
      : true;

    const finalPrice = getSalePrice(product);

    const categoryName =
      product.categories[0]?.category.translations[0]?.name ??
      product.categories[0]?.category.slug ??
      "Skincare";

    return [
      product.id,
      name,
      description,
      isInStock ? "in stock" : "out of stock",
      "new",
      formatPrice(finalPrice),
      productUrl,
      imageUrl,
      product.brand?.name ?? "Asian Beauty Shop",
      "Health & Beauty > Personal Care > Cosmetics > Skin Care",
      categoryName,
      product.id,
      product.barcode ?? "",
      product.sku,
    ].map(csvEscape);
  });

  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
