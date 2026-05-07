// ─────────────────────────────────────────────────────────────────────────
// Low-stock query — find every ProductVariant whose stock is at or below
// the configured threshold.
//
// Threshold lives in Setting (`inventory.lowStockThreshold`, integer) so
// an admin can tune it from the admin without a redeploy. Default is 5 if
// unset. Must be >= 0.
//
// Returned rows are shaped for rendering in the low-stock digest email:
// product name (best-effort EN translation) + variant label + SKU +
// current stock + a quick link back to the admin product page.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LowStockRow = {
  variantId: string;
  productId: string;
  sku: string;
  variantLabel: string;
  productName: string;
  stock: number;
  /** Admin-panel URL for an admin to jump straight to the product editor. */
  adminUrl: string;
};

export type LowStockReport = {
  threshold: number;
  rows: LowStockRow[];
};

const DEFAULT_THRESHOLD = 5;
const SETTING_KEY = "inventory.lowStockThreshold";

/**
 * Read the threshold from Setting, falling back to DEFAULT_THRESHOLD.
 * Stored as a JSON number (e.g. `5`). Defensive against bad values.
 */
export async function getLowStockThreshold(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return DEFAULT_THRESHOLD;

  const v = row.valueJson;
  // Accept `5`, `"5"`, or `{ value: 5 }` — we've used all three shapes in
  // other settings historically.
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") n = Number.parseInt(v, 10);
  else if (v && typeof v === "object" && !Array.isArray(v)) {
    const cand = (v as Record<string, unknown>).value;
    if (typeof cand === "number") n = cand;
    else if (typeof cand === "string") n = Number.parseInt(cand, 10);
  }

  if (n === null || !Number.isFinite(n) || n < 0) return DEFAULT_THRESHOLD;
  return Math.floor(n);
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu"
  );
}

/**
 * Build the low-stock report. Reads threshold, fetches matching variants
 * with their product + EN translation, returns a structured list.
 *
 * Ordered by stock ASC then product name so the most urgent items sit at
 * the top of the email.
 */
export async function getLowStockReport(): Promise<LowStockReport> {
  const threshold = await getLowStockThreshold();

  const variants = await prisma.productVariant.findMany({
    where: { stock: { lte: threshold } },
    orderBy: [{ stock: "asc" }],
    select: {
      id: true,
      productId: true,
      sku: true,
      label: true,
      stock: true,
      product: {
        select: {
          id: true,
          translations: {
            where: { locale: Locale.EN },
            select: { name: true },
            take: 1,
          },
        },
      },
    },
  });

  const rows: LowStockRow[] = variants.map((v) => {
    const name = v.product?.translations?.[0]?.name ?? "Untitled product";
    return {
      variantId: v.id,
      productId: v.productId,
      sku: v.sku,
      variantLabel: v.label,
      productName: name,
      stock: v.stock,
      adminUrl: `${siteUrl()}/admin/products/${encodeURIComponent(v.productId)}`,
    };
  });

  return { threshold, rows };
}
