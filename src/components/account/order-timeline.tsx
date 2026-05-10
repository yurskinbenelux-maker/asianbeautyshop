// ─────────────────────────────────────────────────────────────────────────
// OrderTimeline — vertical 5-step status tracker for /account/orders/[number]
//
// Symmetric to ReturnTimeline (A3) but for the order lifecycle. Customers
// open the order page expecting to see "where is my parcel" — a vertical
// timeline answers that in one glance.
//
// Happy path:
//   ORDERED → PAID → PREPARING → SHIPPED → DELIVERED
//
// Off-path collapse (single closure card):
//   CANCELLED, REFUNDED, PARTIALLY_REFUNDED
//
// Tone language reuses the return timeline's palette so the two pages
// read as a coherent system: sage = complete, vermilion ring = current,
// ink-soft = upcoming.
//
// Pure server component — no interactivity. The "Track parcel" CTA on
// the SHIPPED step is a plain anchor that opens carrier tracking in a
// new tab; we hide it when no tracking URL has been posted.
// ─────────────────────────────────────────────────────────────────────────

import { Truck } from "lucide-react";
import { useTranslations } from "next-intl";

type OrderTimelineStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

// Happy-path step keys — these map 1:1 to the visible stepper rows.
// CANCELLED / REFUNDED / PARTIALLY_REFUNDED are off-path and short-
// circuit the renderer below.
const HAPPY_PATH = [
  "ORDERED",
  "PAID",
  "PREPARING",
  "SHIPPED",
  "DELIVERED",
] as const;
type StepKey = (typeof HAPPY_PATH)[number];

type OrderTimelineProps = {
  status: OrderTimelineStatus;
  /** Locale-aware date formatter from the parent page so strings match
   *  the rest of the order detail layout. */
  formatDate: (d: Date) => string;
  placedAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  /** Carrier tracking URL — surfaces a "Track parcel" CTA inline on the
   *  SHIPPED step when present. Null until Sendcloud posts it. */
  trackingUrl: string | null;
  trackingNumber: string | null;
};

export function OrderTimeline(props: OrderTimelineProps) {
  const t = useTranslations("account");

  // ── Off-path terminal states ──────────────────────────────────────
  if (
    props.status === "CANCELLED" ||
    props.status === "REFUNDED" ||
    props.status === "PARTIALLY_REFUNDED"
  ) {
    const titleKey =
      props.status === "CANCELLED"
        ? "order_timeline_cancelled_title"
        : props.status === "REFUNDED"
          ? "order_timeline_refunded_title"
          : "order_timeline_partially_refunded_title";
    const bodyKey =
      props.status === "CANCELLED"
        ? "order_timeline_cancelled_body"
        : props.status === "REFUNDED"
          ? "order_timeline_refunded_body"
          : "order_timeline_partially_refunded_body";

    return (
      <section
        className="border border-ink/10 bg-white/50 p-6 md:p-8"
        aria-label={t("order_timeline_heading")}
      >
        <div className="eyebrow">{t("order_timeline_status_label")}</div>
        <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
          {t(titleKey)}
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
          {t(bodyKey)}
        </p>
      </section>
    );
  }

  // ── Happy-path index. Each status maps to the LATEST step it has
  //     reached. PENDING shows step 0 (Ordered) ringed; once PAID, the
  //     paid step lights up; FULFILLING activates Preparing; etc.
  //     A status not on the path lands at -1, but the off-path branch
  //     above already caught those, so this should never fire. ──────
  const currentIndex: number = (() => {
    switch (props.status) {
      case "PENDING": return 0;        // Ordered — paid not yet
      case "PAID": return 1;           // money confirmed
      case "FULFILLING": return 2;     // packing
      case "SHIPPED": return 3;
      case "DELIVERED": return 4;
      default: return -1;
    }
  })();

  type Step = {
    key: StepKey;
    title: string;
    body: string;
    detail: string | null;
  };

  const steps: Step[] = [
    {
      key: "ORDERED",
      title: t("order_timeline_step_ordered_title"),
      body: t("order_timeline_step_ordered_body"),
      detail: t("order_timeline_step_ordered_detail", {
        date: props.formatDate(props.placedAt),
      }),
    },
    {
      key: "PAID",
      title: t("order_timeline_step_paid_title"),
      body: t("order_timeline_step_paid_body"),
      detail:
        props.paidAt && currentIndex >= 1
          ? t("order_timeline_step_paid_detail", {
              date: props.formatDate(props.paidAt),
            })
          : null,
    },
    {
      key: "PREPARING",
      title: t("order_timeline_step_preparing_title"),
      body: t("order_timeline_step_preparing_body"),
      detail: null, // no separate timestamp for FULFILLING
    },
    {
      key: "SHIPPED",
      title: t("order_timeline_step_shipped_title"),
      body: t("order_timeline_step_shipped_body"),
      detail:
        props.shippedAt && currentIndex >= 3
          ? t("order_timeline_step_shipped_detail", {
              date: props.formatDate(props.shippedAt),
            })
          : null,
    },
    {
      key: "DELIVERED",
      title: t("order_timeline_step_delivered_title"),
      body: t("order_timeline_step_delivered_body"),
      detail:
        props.deliveredAt && currentIndex >= 4
          ? t("order_timeline_step_delivered_detail", {
              date: props.formatDate(props.deliveredAt),
            })
          : null,
    },
  ];

  return (
    <section
      className="border border-ink/10 bg-white/50 p-6 md:p-8"
      aria-label={t("order_timeline_heading")}
    >
      <div className="eyebrow">{t("order_timeline_heading")}</div>

      <ol className="mt-6 space-y-0">
        {steps.map((step, i) => {
          const reached = i <= currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === steps.length - 1;

          // Same dot-and-connector palette as ReturnTimeline so the two
          // pages read as a system. Sage = complete, vermilion ring =
          // active, ink-soft = upcoming.
          const dotClass = isCurrent
            ? "border-vermilion bg-white"
            : reached
              ? "border-sage bg-sage"
              : "border-ink/20 bg-white";

          const nextReached = i + 1 <= currentIndex;
          const lineClass = nextReached
            ? "bg-sage"
            : reached
              ? "bg-sage/40"
              : "bg-ink/10";

          return (
            <li key={step.key} className="relative flex gap-5 pb-7 last:pb-0">
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

                {/* Tracking CTA — appears on the SHIPPED step when the
                 *  carrier has posted a URL. Hidden after delivery (the
                 *  link still works but the customer doesn't need it
                 *  anymore — the parcel is in their hands). */}
                {step.key === "SHIPPED" &&
                isCurrent &&
                props.trackingUrl ? (
                  <div className="mt-4">
                    <a
                      href={props.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center gap-2 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
                    >
                      <Truck className="h-4 w-4" aria-hidden />
                      {t("order_timeline_track_cta")}
                    </a>
                    {props.trackingNumber ? (
                      <p className="mt-2 font-mono text-[11px] text-ink-mid">
                        {props.trackingNumber}
                      </p>
                    ) : null}
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
