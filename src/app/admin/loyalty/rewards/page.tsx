// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/rewards — list + inline create form.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft, Plus, Gift } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";
import { requireCapability } from "@/lib/auth-roles";
import { RewardForm, type ProductOption } from "./form";
import { toggleRewardActiveAction } from "./actions";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  PRODUCT_FREE: "Free product",
  GIFT_CARD: "Gift card",
  COUPON_FIXED: "€ off",
  COUPON_PERCENT: "% off",
} as const;

export default async function AdminLoyaltyRewardsPage() {
  await requireCapability("loyalty.edit");

  const [rewards, products] = await Promise.all([
    prisma.loyaltyReward.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        product: {
          select: {
            sku: true,
            translations: {
              where: { locale: Locale.EN },
              select: { name: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { sku: "asc" },
      select: {
        id: true,
        sku: true,
        translations: {
          where: { locale: Locale.EN },
          select: { name: true },
          take: 1,
        },
      },
    }),
  ]);

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    label: `${p.sku} · ${p.translations[0]?.name ?? "(no EN name)"}`,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/loyalty"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Loyalty hub
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Ways to redeem
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
        What customers see when they tap "Redeem points". Mix free products,
        gift cards and discount codes — each with its own points cost.
      </p>

      <section className="mt-8">
        <h2 className="eyebrow mb-3">Existing rewards</h2>
        {rewards.length === 0 ? (
          <div className="border border-dashed border-ink/15 bg-white/40 px-6 py-10 text-center">
            <Gift className="mx-auto h-5 w-5 text-ink-mid" />
            <p className="mt-3 text-[13px] text-ink-mid">No rewards yet.</p>
          </div>
        ) : (
          <div className="border border-ink/10 bg-white/60">
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
              <thead className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Cost</th>
                  <th className="px-4 py-3 text-right">Active</th>
                  <th className="px-4 py-3 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => {
                  const value =
                    r.kind === "PRODUCT_FREE"
                      ? r.product?.translations[0]?.name ?? r.product?.sku ?? "—"
                      : r.kind === "COUPON_PERCENT"
                        ? `${r.percentOff ?? 0}%`
                        : r.valueCents != null
                          ? `€${(r.valueCents / 100).toFixed(2)}`
                          : "—";
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-ink/5 last:border-b-0"
                    >
                      <td className="px-4 py-3 align-middle text-ink">
                        {r.title}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink-mid">
                        {KIND_LABEL[r.kind]}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink-mid">
                        {value}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-display text-[14px] text-ink">
                        {r.pointsCost.toLocaleString()} pts
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <form action={toggleRewardActiveAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input
                            type="hidden"
                            name="nextActive"
                            value={(!r.isActive).toString()}
                          />
                          <button
                            type="submit"
                            className={
                              r.isActive
                                ? "text-[11px] uppercase tracking-label text-sage hover:text-sage/80"
                                : "text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                            }
                          >
                            {r.isActive ? "Active" : "Inactive"}
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <Link
                          href={`/admin/loyalty/rewards/${r.id}`}
                          className="text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        )}
      </section>

      <section className="mt-12 border-t border-ink/10 pt-10">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-vermilion" />
          <h2 className="font-display text-[20px] text-ink">Add a reward</h2>
        </div>
        <RewardForm products={productOptions} />
      </section>
    </div>
  );
}
