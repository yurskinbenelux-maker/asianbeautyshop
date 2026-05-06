// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing — index page that fans out to every marketing
// surface Sofia can edit. Modelled on /admin/homepage but for
// time-bounded campaigns rather than evergreen copy.
//
// Three cards as of launch:
//   · Welcome popup
//   · Quiz popup
//   · Promotions (the central discount-% settings)
//
// Each card shows whether the surface is currently enabled — small but
// useful when Sofia wants to know at a glance if either popup is paused.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  CircleSlash,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { readWelcomePopupSettings } from "@/lib/queries/welcome-popup";
import { readQuizPopupSettings } from "@/lib/queries/quiz-popup";
import { readPromoSettings } from "@/lib/queries/promotions";

export const dynamic = "force-dynamic";

export default async function AdminMarketingIndex() {
  await requireCapability("homepage.edit", "/admin");

  const [welcome, quiz, promo] = await Promise.all([
    readWelcomePopupSettings(),
    readQuizPopupSettings(),
    readPromoSettings(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-10 max-w-3xl">
        <div className="eyebrow">Marketing</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Campaigns &amp; conversion surfaces
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          Every conversion-driving surface that's editable at runtime.
          Each card is its own page — open it, save your edits, the
          public site picks them up on the next page load.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3">
        <Card
          href="/admin/marketing/welcome-popup"
          icon={Megaphone}
          title="Welcome popup"
          description={
            <>
              The on-load popup that fires when visitors land on the
              homepage. Image, copy, and discount text are fully
              editable. Currently fires{" "}
              <strong>{welcome.delaySeconds}s</strong> after first paint.
            </>
          }
          enabled={welcome.enabled}
        />

        <Card
          href="/admin/marketing/quiz-popup"
          icon={Sparkles}
          title="Quiz popup"
          description={
            <>
              The second popup, nudging visitors toward the skin quiz.
              Fires <strong>{quiz.delaySecondsAfterWelcome}s</strong>{" "}
              after the welcome popup is closed (or skipped). Same
              two-column treatment.
            </>
          }
          enabled={quiz.enabled}
        />

        <Card
          href="/admin/marketing/promotions"
          icon={BadgePercent}
          title="Promotions"
          description={
            <>
              The central discount percentages — registration welcome
              ({promo.registrationWelcomePct}%) and quiz reward (
              {promo.quizRewardPct}%). One source of truth that powers
              every coupon mint and every percent-off label across the
              site.
            </>
          }
          alwaysActive
        />
      </div>

      <div className="mt-10 border-t border-ink/10 pt-6 text-[12px] leading-relaxed text-ink-mid">
        <p>
          <span className="font-medium text-ink">Tip —</span> popups
          respect a 14-day suppression cookie per browser. To preview
          edits, open the homepage in a private window.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// One row of the marketing index. Same hover treatment as the homepage
// editor index, plus a small enabled/paused badge in the corner.
// ─────────────────────────────────────────────────────────────────────────
function Card({
  href,
  icon: Icon,
  title,
  description,
  enabled,
  alwaysActive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  enabled?: boolean;
  alwaysActive?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 border border-ink/10 bg-white/60 p-5 transition-colors hover:border-ink/25 hover:bg-white/80"
    >
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-ink-mid group-hover:text-ink" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="font-display text-[18px] text-ink">{title}</div>
          {alwaysActive ? null : enabled ? (
            <span className="inline-flex items-center gap-1 border border-sage/40 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
              <CircleSlash className="h-3 w-3" />
              Paused
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">
          {description}
        </p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-ink-mid/0 transition-opacity group-hover:text-ink group-hover:opacity-100" />
    </Link>
  );
}
