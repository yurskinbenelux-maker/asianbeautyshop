// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/tiers/[id] — edit one tier in isolation.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { TierForm } from "../form";

export const dynamic = "force-dynamic";

export default async function EditTierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability("loyalty.edit");
  const { id } = await params;
  const tier = await prisma.loyaltyTier.findUnique({ where: { id } });
  if (!tier) notFound();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/loyalty/tiers"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        All tiers
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Edit {tier.name}
      </h1>
      <TierForm initial={tier} />
    </div>
  );
}
