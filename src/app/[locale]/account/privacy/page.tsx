// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/privacy — GDPR-friendly self-service data controls.
//
// Two cards:
//   · Download my data — a GET /api/account/export link.  Streams a JSON
//     archive of the caller's profile, addresses, orders, reviews,
//     wishlist, returns, contact messages, and newsletter history.
//   · Delete my account — POSTs to requestAccountDeletion (see actions.ts),
//     flipping User.deletedAt and signing the user out.  While the user
//     is still signed in, they can also cancel a pending deletion here.
//
// If ?error=… is present, we render a small inline alert.  ?cancelled=1
// shows a confirmation strip.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Download, AlertTriangle, ShieldCheck, RotateCcw } from "lucide-react";

import { requireCustomer } from "@/lib/auth";
import {
  ERASURE_GRACE_DAYS,
  getAccountDeletionStatus,
} from "@/lib/queries/gdpr";
import { priceLocale } from "@/lib/utils";

import {
  requestAccountDeletion,
  cancelAccountDeletionAction,
} from "./actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; cancelled?: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

export default async function PrivacyPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/privacy",
  });

  const t = await getTranslations("privacy");
  const status = await getAccountDeletionStatus(profile.id);

  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section>
      <div className="eyebrow">{t("eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
        {t("lede")}
      </p>

      {/* ── scheduled-deletion banner ─────────────────────────── */}
      {status.scheduled && status.hardDeleteOn && (
        <div
          className="mt-8 flex flex-col gap-3 border border-vermilion/30 bg-vermilion/5 px-5 py-4 text-[13px] text-ink md:flex-row md:items-center md:justify-between"
          role="status"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-vermilion" />
            <div>
              <div className="font-display text-[15px] leading-tight text-ink">
                {t("banner_scheduled_title")}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                {t("banner_scheduled_body", {
                  date: dateFmt.format(status.hardDeleteOn),
                })}
              </p>
            </div>
          </div>
          <form action={cancelAccountDeletionAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 border border-ink bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-rice"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("banner_scheduled_cta")}
            </button>
          </form>
        </div>
      )}

      {sp.cancelled === "1" && !status.scheduled && (
        <div
          role="status"
          className="mt-8 flex items-center gap-3 border border-celadon/40 bg-celadon/10 px-5 py-3 text-[13px] text-ink"
        >
          <ShieldCheck className="h-4 w-4 text-celadon" />
          {t("cancelled_notice")}
        </div>
      )}

      <div className="rule my-10" />

      {/* ── data export ───────────────────────────────────────── */}
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-[22px] leading-tight text-ink">
            {t("export_heading")}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
            {t("export_lede")}
          </p>
          <ul className="mt-5 space-y-2 text-[13px] text-ink-mid">
            <li>— {t("export_list_profile")}</li>
            <li>— {t("export_list_orders")}</li>
            <li>— {t("export_list_returns")}</li>
            <li>— {t("export_list_wishlist")}</li>
            <li>— {t("export_list_reviews")}</li>
            <li>— {t("export_list_messages")}</li>
          </ul>
          <a
            href="/api/account/export"
            className="mt-6 inline-flex h-11 items-center gap-2 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
          >
            <Download className="h-4 w-4" />
            {t("export_cta")}
          </a>
          <p className="mt-3 text-[11px] text-ink-mid">
            {t("export_format_hint")}
          </p>
        </div>

        {/* ── erasure ──────────────────────────────────────────── */}
        <div>
          <h2 className="font-display text-[22px] leading-tight text-ink">
            {t("delete_heading")}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
            {t("delete_lede", { days: ERASURE_GRACE_DAYS })}
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-mid">
            {t("delete_keeps_orders")}
          </p>

          {!status.scheduled && (
            <form action={requestAccountDeletion} className="mt-6 space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                  {t("delete_confirm_label")}
                </span>
                <input
                  type="text"
                  name="confirm"
                  required
                  autoComplete="off"
                  placeholder="DELETE"
                  pattern="DELETE"
                  aria-describedby="delete-confirm-hint"
                  className="w-full max-w-xs border border-ink/15 bg-white/50 px-3 py-2 font-mono text-[13px] tracking-[0.2em] text-ink focus:border-vermilion focus:outline-none"
                />
                <span
                  id="delete-confirm-hint"
                  className="mt-1 block text-[11px] text-ink-mid"
                >
                  {t("delete_confirm_hint")}
                </span>
              </label>
              {sp.error === "confirm" && (
                <p role="alert" className="text-[12px] text-vermilion">
                  {t("delete_error_confirm")}
                </p>
              )}
              {sp.error === "server" && (
                <p role="alert" className="text-[12px] text-vermilion">
                  {t("delete_error_server")}
                </p>
              )}
              <button
                type="submit"
                className="inline-flex h-11 items-center border border-vermilion bg-vermilion px-5 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink hover:border-ink"
              >
                {t("delete_cta")}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="rule my-12" />

      <div className="max-w-2xl">
        <h2 className="font-display text-[18px] leading-tight text-ink">
          {t("more_heading")}
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          {t("more_body")}
        </p>
      </div>
    </section>
  );
}
