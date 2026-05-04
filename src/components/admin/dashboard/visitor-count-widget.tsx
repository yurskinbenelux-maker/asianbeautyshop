// ─────────────────────────────────────────────────────────────────────────
// VisitorCountWidget — live "X people on the site right now" tile for
// /admin overview.
//
// Doesn't drive any decisions on its own — it's a reassurance + early-
// warning signal. Sofia checks this when she's wondering "are we busy?"
// or when the site feels slow and she wants to know if it's traffic.
//
// Visual states match the VAT widget pattern: calm cream when comfy,
// amber when approaching the Hostinger Max Processes practical limit,
// vermilion when she should worry.
// ─────────────────────────────────────────────────────────────────────────

import { Activity, AlertTriangle } from "lucide-react";
import type { VisitorCount } from "@/lib/queries/visitor-count";

export function VisitorCountWidget({ data }: { data: VisitorCount }) {
  const { online, onlineWithBots, windowMinutes, hostingerCeiling, status, topPaths } =
    data;

  const cardTone = {
    calm: "border-ink/10 bg-white/60",
    amber: "border-yellow-600/40 bg-yellow-50/40",
    red: "border-vermilion/40 bg-vermilion/5",
  }[status];

  const numberTone = {
    calm: "text-ink",
    amber: "text-yellow-700",
    red: "text-vermilion",
  }[status];

  // Bot count is a simple subtraction. Don't show a separate row when
  // it's zero — visual noise.
  const botsOnly = Math.max(0, onlineWithBots - online);

  return (
    <article className={`border ${cardTone} p-6 md:p-8 transition-colors`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <Activity className="h-3 w-3 text-vermilion" aria-hidden />
            Live
          </div>
          <h2 className="mt-2 font-display text-[24px] leading-tight text-ink">
            People on the site
          </h2>
        </div>
        {status === "red" ? (
          <span className="inline-flex items-center gap-2 bg-vermilion px-3 py-1.5 text-[10px] uppercase tracking-label text-rice">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Approaching Hostinger ceiling
          </span>
        ) : status === "amber" ? (
          <span className="inline-flex items-center gap-2 border border-yellow-600 px-3 py-1.5 text-[10px] uppercase tracking-label text-yellow-700">
            Busy
          </span>
        ) : null}
      </header>

      {/* Big number + ceiling reference */}
      <div className="mt-6 flex items-baseline gap-4">
        <div className={`font-display text-[64px] leading-none ${numberTone}`}>
          {online}
        </div>
        <div className="text-[12px] uppercase tracking-label text-ink-mid">
          {online === 1 ? "visitor" : "visitors"}
          <br />
          in the last {windowMinutes} min
        </div>
      </div>

      {/* Subtle bot disclosure — only shown when bots are visible */}
      {botsOnly > 0 ? (
        <p className="mt-3 text-[11px] text-ink-mid">
          + {botsOnly} crawler{botsOnly === 1 ? "" : "s"} (excluded from count above)
        </p>
      ) : null}

      {/* Capacity hint — translates raw number into the Hostinger context */}
      <div className="mt-6 border-t border-ink/10 pt-4 text-[12px] leading-relaxed">
        {status === "calm" ? (
          <p className="text-ink-mid">
            Plenty of room — Hostinger Business handles roughly 50–80
            simultaneous visitors comfortably (max-processes ceiling{" "}
            {hostingerCeiling}). Anything under 30 is whisper-quiet.
          </p>
        ) : status === "amber" ? (
          <p className="text-ink">
            <strong>Site is busy.</strong> You're entering the band where
            Hostinger Business starts to feel the load (max-processes
            ceiling {hostingerCeiling}). Performance is still fine; if
            you see this state often, plan a Cloud Startup upgrade.
          </p>
        ) : (
          <p className="text-vermilion">
            <strong>Heavy load.</strong> Approaching the Hostinger
            max-processes ceiling ({hostingerCeiling}). Pages may queue
            or briefly 503 at sustained levels. Upgrade to Cloud Startup
            if this state lasts more than a few minutes.
          </p>
        )}
      </div>

      {/* Top paths — gives Sofia a sense of what visitors are looking at */}
      {topPaths.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-mid">
          <span className="uppercase tracking-label">Top paths:</span>
          {topPaths.map((p) => (
            <span key={p.path} className="inline-flex items-baseline gap-1">
              <span className="font-mono text-[10px] text-ink">{p.path}</span>
              <span>· {p.count}</span>
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
