// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/rewards/[id] — edit one reward.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";
import { requireCapability } from "@/lib/auth-roles";
import { RewardForm, type ProductOption } from "../form";

export const dynamic = "force-dynamic";

export default async function EditRewardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability("loyalty.edit");
  const { id } = await params;

  const [reward, products] = await Promise.all([
    prisma.loyaltyReward.findUnique({ where: { id } }),
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
  if (!reward) notFound();

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    label: `${p.sku} · ${p.translations[0]?.name ?? "(no EN name)"}`,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/loyalty/rewards"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        All rewards
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Edit {reward.title}
      </h1>
      <RewardForm initial={reward} products={productOptions} />
    </div>
  );
}
