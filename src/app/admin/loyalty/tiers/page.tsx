// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/tiers — list + inline create form.
//
// Each existing row links to a per-id edit page. The "new tier" form
// lives at the bottom of this page so the most common admin task —
// adding one — is reachable without navigating.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft, Plus, Layers } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { getLoyaltyTiers } from "@/lib/loyalty/tiers";
import { TierForm } from "./form";
import { toggleTierActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltyTiersPage() {
  await requireCapability("loyalty.edit");
  const tiers = await getLoyaltyTiers();

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href="/admin/loyalty"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Loyalty hub
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Tiers
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
        Customers move up the ladder based on their LIFETIME points (never
        decremented). Each tier just needs a name and a threshold.
      </p>

      {/* existing tiers */}
      <section className="mt-8">
        <h2 className="eyebrow mb-3">Existing</h2>
        {tiers.length === 0 ? (
          <div className="border border-dashed border-ink/15 bg-white/40 px-6 py-10 text-center">
            <Layers className="mx-auto h-5 w-5 text-ink-mid" />
            <p className="mt-3 text-[13px] text-ink-mid">No tiers yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink/10 border border-ink/10 bg-white/60">
            {tiers.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="font-display text-[18px] leading-tight text-ink">
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-mid">
                    Threshold {t.pointsThreshold.toLocaleString()} pts
                    {t.isActive ? "" : " · inactive"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <form action={toggleTierActiveAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      type="hidden"
                      name="nextActive"
                      value={(!t.isActive).toString()}
                    />
                    <button
                      type="submit"
                      className={
                        t.isActive
                          ? "text-[11px] uppercase tracking-label text-sage hover:text-sage/80"
                          : "text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                      }
                    >
                      {t.isActive ? "Active" : "Inactive"}
                    </button>
                  </form>
                  <Link
                    href={`/admin/loyalty/tiers/${t.id}`}
                    className="text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
                  >
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* inline create form */}
      <section className="mt-12 border-t border-ink/10 pt-10">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-vermilion" />
          <h2 className="font-display text-[20px] text-ink">Add a tier</h2>
        </div>
        <p className="mt-1 text-[13px] text-ink-mid">
          Defaults: Bud / Bloom / Aurora / Atelier are seeded on first open.
        </p>
        <TierForm />
      </section>
    </div>
  );
}
