// ─────────────────────────────────────────────────────────────────────────
// ReturnTimeline — vertical 4-step status tracker for /account/returns/[number]
//
// Happy path:
//   REQUESTED → APPROVED → RECEIVED → REFUNDED
//
// Off-path terminal states (REJECTED / CANCELLED) collapse the timeline
// to a single closure card so the customer doesn't see a confusing
// half-progressed bar for a return that's gone nowhere.
//
// Visual language matches the rest of the editorial palette: sage for
// completed (mirrors RETURN inventory pills + "Total credited" on
// credit notes), vermilion ring for the current step, ink-soft for
// upcoming. Connector lines between dots are sage when both ends are
// reached, ink-soft otherwise.
//
// Pure server component — no interactivity. The "Download return
// label" CTA is a plain anchor when present, hidden otherwise.
// ─────────────────────────────────────────────────────────────────────────

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReturnStatus } from "@/lib/returns/types";

const HAPPY_PATH: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"];

type ReturnTimelineProps = {
  status: ReturnStatus;
  /** Locale-aware date formatter from the parent page so the strings
   *  match the rest of the page (no separate Intl init). */
  formatDate: (d: Date) => string;
  /** Currency formatter for the refund row. */
  formatEur: (v: number) => string;
  createdAt: Date;
  receivedAt: Date | null;
  refundedAt: Date | null;
  refundAmount: number | null;
  adminNotes: string | null;
  /** Set on APPROVED transitions when Sendcloud minted a return label. */
  prepaidLabelUrl: string | null;
};

export function ReturnTimeline(props: ReturnTimelineProps) {
  const t = useTranslations("returns");

  // ── Off-path terminal states ──────────────────────────────────────────
  if (props.status === "REJECTED" || props.status === "CANCELLED") {
    const titleKey =
      props.status === "REJECTED"
        ? "timeline_rejected_title"
        : "timeline_cancelled_title";
    const bodyKey =
      props.status === "REJECTED"
        ? "timeline_rejected_body"
        : "timeline_cancelled_body";

    return (
      <section
        className="border border-ink/10 bg-white/50 p-6 md:p-8"
        aria-label={t("timeline_heading")}
      >
        <div className="eyebrow">{t("timeline_status_label")}</div>
        <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
          {t(titleKey)}
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
          {t(bodyKey)}
        </p>
        {props.adminNotes && props.status === "REJECTED" ? (
          <div className="mt-5 border-l-2 border-ink/15 pl-4">
            <div className="text-[11px] uppercase tracking-label text-ink-mid">
              {t("timeline_admin_notes")}
            </div>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink">
              {props.adminNotes}
            </p>
          </div>
        ) : null}
      </section>
    );
  }

  // ── Happy-path stepper ────────────────────────────────────────────────
  // Index of the current status on the happy path. Returns -1 for any
  // status that isn't on the path (defensive — shouldn't happen since
  // the off-path branches above caught REJECTED/CANCELLED).
  const currentIndex = HAPPY_PATH.indexOf(props.status);

  type Step = {
    key: ReturnStatus;
    title: string;
    body: string;
    /** Optional date line shown under the body when the step has been
     *  reached. Refunded gets the amount baked into its date line. */
    detail: string | null;
  };

  const steps: Step[] = [
    {
      key: "REQUESTED",
      title: t("timeline_step_requested_title"),
      body: t("timeline_step_requested_body"),
      detail: t("timeline_step_requested_detail", {
        date: props.formatDate(props.createdAt),
      }),
    },
    {
      key: "APPROVED",
      title: t("timeline_step_approved_title"),
      body: t("timeline_step_approved_body"),
      detail: null, // we don't store approvedAt; date omitted on purpose
    },
    {
      key: "RECEIVED",
      title: t("timeline_step_received_title"),
      body: t("timeline_step_received_body"),
      detail:
        props.receivedAt && currentIndex >= HAPPY_PATH.indexOf("RECEIVED")
          ? t("timeline_step_received_detail", {
              date: props.formatDate(props.receivedAt),
            })
          : null,
    },
    {
      key: "REFUNDED",
      title: t("timeline_step_refunded_title"),
      body: t("timeline_step_refunded_body"),
      detail:
        props.refundedAt &&
        props.refundAmount !== null &&
        currentIndex >= HAPPY_PATH.indexOf("REFUNDED")
          ? t("timeline_step_refunded_detail", {
              amount: props.formatEur(props.refundAmount),
              date: props.formatDate(props.refundedAt),
            })
          : null,
    },
  ];

  return (
    <section
      className="border border-ink/10 bg-white/50 p-6 md:p-8"
      aria-label={t("timeline_heading")}
    >
      <div className="eyebrow">{t("timeline_heading")}</div>

      <ol className="mt-6 space-y-0">
        {steps.map((step, i) => {
          const reached = i <= currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === steps.length - 1;

          // Dot tones tuned to mirror the inventory-pill palette:
          // sage = complete (positive), vermilion ring = current
          // (attention), ink-soft = upcoming (muted).
          const dotClass = isCurrent
            ? "border-vermilion bg-white"
            : reached
              ? "border-sage bg-sage"
              : "border-ink/20 bg-white";

          // Connector tone — sage when both this step AND the next are
          // reached; otherwise muted. Hidden on the last step entirely.
          const nextReached = i + 1 <= currentIndex;
          const lineClass = nextReached
            ? "bg-sage"
            : reached
              ? "bg-sage/40"
              : "bg-ink/10";

          return (
            <li key={step.key} className="relative flex gap-5 pb-7 last:pb-0">
              {/* dot + connector column */}
              <div className="relative flex flex-col items-center">
                <span
                  className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${dotClass}`}
                  aria-hidden
                />
                {!isLast ? (
                  <span
                    className={`absolute left-1/2 top-5 h-full w-px -translate-x-1/2 ${lineClass}`}
                    aria-hidden
                  />
                ) : null}
              </div>

              {/* content column */}
              <div className="flex-1">
                <div
                  className={
                    "font-display text-[16px] leading-tight " +
                    (reached ? "text-ink" : "text-ink-mid")
                  }
                >
                  {step.title}
                </div>
                <p
                  className={
                    "mt-1 text-[13px] leading-relaxed " +
                    (reached ? "text-ink-mid" : "text-ink-mid/70")
                  }
                >
                  {step.body}
                </p>
                {step.detail && reached ? (
                  <p className="mt-1.5 text-[12px] uppercase tracking-label text-ink-mid">
                    {step.detail}
                  </p>
                ) : null}

                {/* Prepaid label CTA — appears on the APPROVED step
                    when Sendcloud handed us a label URL. The actual
                    download happens via Sendcloud-hosted PDF. */}
                {step.key === "APPROVED" &&
                isCurrent &&
                props.prepaidLabelUrl ? (
                  <div className="mt-4">
                    <a
                      href={props.prepaidLabelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center gap-2 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      {t("timeline_label_cta")}
                    </a>
                    <p className="mt-2 text-[12px] text-ink-mid">
                      {t("timeline_label_hint")}
                    </p>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
