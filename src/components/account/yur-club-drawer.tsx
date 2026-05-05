// ─────────────────────────────────────────────────────────────────────────
// YurClubDrawer — the loyalty drawer that opens from the account sidebar.
//
// Design intent (NOT the pink-confection competitor aesthetic):
//   · Ivory paper background — calls to the YU.R Gift Card visual
//   · Vermilion peony seal as decorative accent in the hero card
//   · Fraunces italic display for tier name + the big points number
//   · Inter for body copy + UI chrome
//   · Hairline rules between sections, no glassmorphism, no shadows
//
// What's in this phase (Phase B — read-only):
//   · Tier card hero (current tier, progress to next, balance, member-since)
//   · Two tiles: Redeem points → /account/club/redeem (Phase D)
//                My coupons   → /account/club/coupons (Phase D)
//   · Refer your friends — code + copy-link CTA (Phase F wires the share)
//   · Milestone progress visualization (Phase G refines)
//   · Ways to earn — placeholder list (Phase E populates from DB)
//   · Ways to redeem — placeholder list (Phase D populates from DB)
//   · My history — full LoyaltyEvent log
//
// What's deferred:
//   · Actual redemption flow (Phase D)
//   · Manual task submission UI (Phase E)
//   · Active referral link sharing + cookie writing (Phase F)
//   · Tier-upgrade animations + polish (Phase G)
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DrawerData, DrawerHistoryEntry } from "@/lib/loyalty/drawer-data";
import type { RedeemableReward } from "@/lib/loyalty/redeem";
import type { TaskWithStatus } from "@/lib/loyalty/tasks";

type Props = {
  data: DrawerData;
  /** Controlled by the sidebar trigger. */
  open: boolean;
  onClose: () => void;
};

export function YurClubDrawer({ data, open, onClose }: Props) {
  // Body-scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="yur-club-drawer-title"
      className="fixed inset-0 z-[80]"
    >
      {/* Backdrop — dim ink, click to close */}
      <button
        aria-label="Close"
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
        style={{
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "yur-club-fade 240ms ease-out both",
        }}
      />

      {/* Panel — slides in from the LEFT, full height, ~480px desktop */}
      <aside
        className="absolute inset-y-0 left-0 flex w-full max-w-[480px] flex-col bg-rice shadow-[0_24px_60px_-20px_rgba(20,17,15,0.35)]"
        style={{ animation: "yur-club-slide 360ms cubic-bezier(0.2,0.8,0.2,1) both" }}
      >
        <DrawerHeader onClose={onClose} />
        <div className="flex-1 overflow-y-auto">
          <TierHeroCard data={data} />
          <ActionTiles activeCouponCount={data.activeCouponCount} />
          <ReferralBlock referralCode={data.account.referralCode} />
          <MilestoneBlock />
          <WaysToRedeemBlock
            rewards={data.topRewards}
            balance={data.account.pointsBalance}
          />
          <WaysToEarnBlock tasks={data.topTasks} />
          <HistoryBlock history={data.history} />
          <DrawerFooter />
        </div>
      </aside>

      <style>{`
        @keyframes yur-club-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes yur-club-slide {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─── header ───────────────────────────────────────────────────────────────

function DrawerHeader({ onClose }: { onClose: () => void }) {
  const t = useTranslations("yur_club");
  return (
    <header className="relative flex items-center justify-between border-b border-ink/10 px-6 py-5">
      <div>
        <div className="text-[10px] uppercase tracking-label text-vermilion">
          {t("eyebrow")}
        </div>
        <h2
          id="yur-club-drawer-title"
          className="mt-0.5 font-display text-[22px] leading-none text-ink"
        >
          {t("title")}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="flex h-9 w-9 items-center justify-center text-ink-mid transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2 2 L12 12 M12 2 L2 12" />
        </svg>
      </button>
    </header>
  );
}

// ─── tier hero card ───────────────────────────────────────────────────────

function TierHeroCard({ data }: { data: DrawerData }) {
  const t = useTranslations("yur_club");
  const { resolved, account, memberSince } = data;
  const memberSinceLabel = memberSince.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <section className="px-6 pt-6">
      <div className="relative overflow-hidden border border-ink/10 bg-white">
        {/* hand-drawn peony seal in the corner — vermilion at low opacity */}
        <svg
          aria-hidden
          viewBox="0 0 140 140"
          className="pointer-events-none absolute -right-4 -top-4 h-[140px] w-[140px] opacity-40"
          fill="none"
          stroke="#C8362C"
          strokeWidth="0.9"
          strokeLinecap="round"
        >
          <circle cx="80" cy="60" r="32" opacity="0.4" />
          <ellipse cx="80" cy="60" rx="14" ry="22" opacity="0.55" />
          <ellipse cx="80" cy="60" rx="22" ry="14" opacity="0.55" transform="rotate(60 80 60)" />
          <ellipse cx="80" cy="60" rx="22" ry="14" opacity="0.55" transform="rotate(120 80 60)" />
          <circle cx="80" cy="60" r="6" fill="#C8362C" opacity="0.6" />
        </svg>

        <div className="relative px-6 py-7">
          {/* tier name */}
          <p className="text-[10px] uppercase tracking-label text-ink-mid">
            {t("tier_label")}
          </p>
          <p
            className="mt-1 font-display italic text-ink"
            style={{ fontSize: "40px", lineHeight: 1, letterSpacing: "-0.01em" }}
          >
            {resolved.current.name}
          </p>

          {/* progress bar */}
          {resolved.next ? (
            <>
              <div
                className="mt-5 h-[3px] w-full bg-ink/10"
                role="progressbar"
                aria-valuenow={Math.round(resolved.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-vermilion transition-[width]"
                  style={{ width: `${resolved.progress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-ink-mid">
                {t("points_to_next", {
                  count: resolved.pointsToNext,
                  next: resolved.next.name,
                })}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[12px] uppercase tracking-label text-vermilion">
              {t("top_tier")}
            </p>
          )}

          {/* big points number */}
          <div className="mt-7 flex items-baseline gap-2">
            <span
              className="font-display text-ink"
              style={{ fontSize: "56px", lineHeight: 1, fontWeight: 400 }}
            >
              {account.pointsBalance.toLocaleString()}
            </span>
            <span className="text-[13px] uppercase tracking-label text-ink-mid">
              {t("points")}
            </span>
          </div>

          {/* member-since */}
          <p className="mt-5 text-[10px] uppercase tracking-label text-ink-mid">
            {t("member_since", { date: memberSinceLabel })}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── action tiles ─────────────────────────────────────────────────────────

function ActionTiles({ activeCouponCount }: { activeCouponCount: number }) {
  const t = useTranslations("yur_club");
  return (
    <section className="px-6 pt-5">
      <div className="grid grid-cols-2 gap-3">
        <Tile
          href="/account/club/redeem"
          title={t("tile_redeem")}
          subtitle={t("tile_redeem_sub")}
          decoKind="ticket"
        />
        <Tile
          href="/account/club/coupons"
          title={t("tile_coupons")}
          subtitle={
            activeCouponCount > 0
              ? t("tile_coupons_count", { count: activeCouponCount })
              : t("tile_coupons_empty")
          }
          decoKind="coupon"
        />
      </div>
    </section>
  );
}

function Tile({
  href,
  title,
  subtitle,
  decoKind,
}: {
  href: string;
  title: string;
  subtitle: string;
  decoKind: "ticket" | "coupon";
}) {
  return (
    <a
      href={href}
      className="group relative block overflow-hidden border border-ink/10 bg-white px-4 py-5 transition-colors hover:border-vermilion/40"
    >
      {/* subtle deco SVG — different per tile so they read as related but distinct */}
      <svg
        aria-hidden
        viewBox="0 0 60 40"
        className="absolute right-2 top-2 h-7 w-10 text-vermilion opacity-50 transition-opacity group-hover:opacity-80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {decoKind === "ticket" ? (
          <>
            <rect x="4" y="8" width="52" height="24" />
            <circle cx="14" cy="20" r="2" fill="currentColor" />
            <circle cx="46" cy="20" r="2" fill="currentColor" />
          </>
        ) : (
          <>
            <path d="M6 14 H54 V26 H6 Z" />
            <path d="M14 14 V26" strokeDasharray="2 2" />
            <text x="40" y="24" fontSize="6" fill="currentColor" stroke="none">%</text>
          </>
        )}
      </svg>

      <p className="text-[10px] uppercase tracking-label text-ink-mid">
        {title}
      </p>
      <p className="mt-1.5 font-display text-[16px] leading-tight text-ink">
        {subtitle}
      </p>
      <span
        aria-hidden
        className="absolute bottom-3 right-3 text-[12px] text-ink-mid transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </a>
  );
}

// ─── referral block ───────────────────────────────────────────────────────

function ReferralBlock({ referralCode }: { referralCode: string }) {
  const t = useTranslations("yur_club");
  const [copiedKind, setCopiedKind] = useState<"code" | "link" | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");

  // Build the share URL on the client so we use the customer's actual
  // origin (yurskinsolution.eu in prod, localhost in dev).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    setShareUrl(`${origin}/?ref=${encodeURIComponent(referralCode)}`);
  }, [referralCode]);

  function copy(kind: "code" | "link", value: string) {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopiedKind(kind);
        setTimeout(() => setCopiedKind(null), 2000);
      },
      () => {
        /* older Safari fallback — value is visible on screen */
      },
    );
  }

  // Web Share API on mobile — falls back to clipboard copy if the API
  // isn't available (desktop, older browsers).
  function share() {
    if (typeof navigator !== "undefined" && "share" in navigator && shareUrl) {
      navigator
        .share({
          title: "YU.R Skin Solution",
          text: "Join me on YU.R — get a welcome discount on your first order.",
          url: shareUrl,
        })
        .catch(() => {
          /* user cancelled or share failed silently */
        });
    } else {
      copy("link", shareUrl);
    }
  }

  return (
    <Section title={t("section_refer")}>
      <p className="text-[13px] leading-relaxed text-ink-mid">
        {t("refer_lede")}
      </p>

      {/* Referral code — short version, copy-only */}
      <div className="mt-4 flex items-center justify-between border border-ink/10 bg-white px-4 py-3">
        <code className="font-mono text-[14px] tracking-[0.16em] text-ink">
          {referralCode}
        </code>
        <button
          type="button"
          onClick={() => copy("code", referralCode)}
          className="text-[11px] uppercase tracking-label text-vermilion transition-colors hover:text-ink"
        >
          {copiedKind === "code" ? t("copied") : t("copy")}
        </button>
      </div>

      {/* Share link — full URL, with native share-sheet on mobile */}
      {shareUrl ? (
        <div className="mt-2 flex items-center justify-between gap-3 border border-ink/10 bg-white px-4 py-3">
          <span className="truncate text-[12px] text-ink-mid">{shareUrl}</span>
          <button
            type="button"
            onClick={share}
            className="shrink-0 text-[11px] uppercase tracking-label text-vermilion transition-colors hover:text-ink"
          >
            {copiedKind === "link" ? t("copied") : t("share")}
          </button>
        </div>
      ) : null}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-mid">
        {t("refer_terms")}
      </p>
    </Section>
  );
}

// ─── milestone block ──────────────────────────────────────────────────────

function MilestoneBlock() {
  const t = useTranslations("yur_club");
  // Phase B placeholder — real progress dots come in Phase G once we
  // surface paidOrderCount + milestoneOrders to the drawer payload.
  return (
    <Section title={t("section_milestones")}>
      <p className="text-[13px] leading-relaxed text-ink-mid">
        {t("milestones_lede")}
      </p>
    </Section>
  );
}

// ─── ways to redeem (live data) ───────────────────────────────────────────

function WaysToRedeemBlock({
  rewards,
  balance,
}: {
  rewards: RedeemableReward[];
  balance: number;
}) {
  const t = useTranslations("yur_club");

  if (rewards.length === 0) {
    return (
      <Section title={t("section_redeem_ways")}>
        <p className="text-[13px] leading-relaxed text-ink-mid">
          {t("redeem_ways_placeholder")}
        </p>
      </Section>
    );
  }

  return (
    <Section title={t("section_redeem_ways")}>
      <ul className="divide-y divide-ink/10 border border-ink/10 bg-white">
        {rewards.map((r) => (
          <li key={r.id}>
            <a
              href={
                r.affordable
                  ? `/account/club/redeem/${r.id}`
                  : "/account/club/redeem"
              }
              className={
                "flex items-center justify-between gap-4 px-4 py-3 transition-colors " +
                (r.affordable
                  ? "hover:bg-rice-dim/40"
                  : "opacity-70")
              }
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">{r.title}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-label text-ink-mid">
                  {r.valueLabel}
                </p>
              </div>
              <span className="shrink-0 font-display text-[14px] text-vermilion">
                {r.pointsCost.toLocaleString()} pts
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a
        href="/account/club/redeem"
        className="mt-3 inline-block text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        See all rewards →
      </a>
      {balance > 0 ? (
        <p className="mt-2 text-[11px] text-ink-mid">
          You have {balance.toLocaleString()} pts to spend.
        </p>
      ) : null}
    </Section>
  );
}

// ─── ways to earn (live data) ─────────────────────────────────────────────

function WaysToEarnBlock({ tasks }: { tasks: TaskWithStatus[] }) {
  const t = useTranslations("yur_club");

  if (tasks.length === 0) {
    return (
      <Section title={t("section_earn_ways")}>
        <p className="text-[13px] leading-relaxed text-ink-mid">
          {t("earn_ways_placeholder")}
        </p>
      </Section>
    );
  }

  return (
    <Section title={t("section_earn_ways")}>
      <ul className="divide-y divide-ink/10 border border-ink/10 bg-white">
        {tasks.map((task) => {
          const navigable =
            task.status === "available" || task.status === "pending";
          const Body = (
            <>
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">{task.title}</p>
                {task.description ? (
                  <p className="mt-0.5 truncate text-[11px] text-ink-mid">
                    {task.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {task.points > 0 ? (
                  <span className="font-display text-[13px] text-vermilion">
                    +{task.points.toLocaleString()}
                  </span>
                ) : null}
                {task.status === "auto" ? (
                  <span className="text-[10px] uppercase tracking-label text-ink-mid">
                    Auto
                  </span>
                ) : task.status === "pending" ? (
                  <span className="text-[10px] uppercase tracking-label text-ink-mid">
                    Pending
                  </span>
                ) : task.status === "approved" ? (
                  <span className="text-[10px] uppercase tracking-label text-sage">
                    Done
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-label text-vermilion">
                    →
                  </span>
                )}
              </div>
            </>
          );
          return (
            <li key={task.id}>
              {navigable ? (
                <a
                  href={`/account/club/earn/${task.slug}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-rice-dim/40"
                >
                  {Body}
                </a>
              ) : (
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  {Body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <a
        href="/account/club/earn"
        className="mt-3 inline-block text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        See all ways to earn →
      </a>
    </Section>
  );
}

// ─── history ──────────────────────────────────────────────────────────────

function HistoryBlock({ history }: { history: DrawerHistoryEntry[] }) {
  const t = useTranslations("yur_club");
  if (history.length === 0) {
    return (
      <Section title={t("section_history")}>
        <p className="text-[13px] leading-relaxed text-ink-mid">
          {t("history_empty")}
        </p>
      </Section>
    );
  }

  return (
    <Section title={t("section_history")}>
      <ul className="divide-y divide-ink/10">
        {history.map((h) => {
          const positive = h.delta >= 0;
          return (
            <li key={h.id} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">{h.reason}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-label text-ink-mid">
                  {h.createdAt.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <span
                className={
                  "shrink-0 font-display text-[15px] " +
                  (positive ? "text-vermilion" : "text-ink-mid")
                }
              >
                {positive ? "+" : ""}
                {h.delta.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ─── shared section wrapper ───────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink/10 px-6 py-6">
      <p className="text-[10px] uppercase tracking-label text-ink-mid">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DrawerFooter() {
  const t = useTranslations("yur_club");
  return (
    <footer className="border-t border-ink/10 bg-rice-dim/40 px-6 py-5 text-center">
      <p className="text-[10px] uppercase tracking-label text-ink-mid">
        {t("footer")}
      </p>
    </footer>
  );
}
