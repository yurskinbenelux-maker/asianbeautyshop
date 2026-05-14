// ─────────────────────────────────────────────────────────────────────────
// /admin/vat-export — Belgian quarterly BTW-aangifte report (G6)
//
// Tiny form: pick year + quarter, hit Download. The actual CSV is built
// by /admin/vat-export/csv (see route.ts there) — this page is the
// human-facing entrance.
//
// Why a separate route for the file itself:
//   · Plain GET handler with a Content-Disposition header lets the
//     browser stream the download cleanly. A server action would force
//     a JSON round-trip.
//   · Putting the form on /admin/vat-export and the file on /csv keeps
//     the URL the admin bookmarks (`/admin/vat-export`) stable even
//     when the file route signature changes.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function VatExportPage() {
  await requireAdmin();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  // Recent year window — three years back covers Belgium's 7-year
  // retention requirement at any reasonable launch cadence; if Sofia
  // ever needs older periods we widen the range or expose a custom
  // date input.
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const quarters = [1, 2, 3, 4] as const;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8">
        <div className="eyebrow">Accounting</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Quarterly VAT report
        </h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-ink-mid">
          Download a CSV with everything your accountant needs for the
          BTW-aangifte: per-country totals, invoice list, and credit-note
          list for the chosen quarter. Open in Excel or Numbers — UTF-8
          + BOM is set so accented names don't mangle.
        </p>
      </header>

      <form
        action="/admin/vat-export/csv"
        method="get"
        className="border border-ink/10 bg-white/60 p-6"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-label text-ink-mid">
              Year
            </span>
            <select
              name="year"
              defaultValue={currentYear}
              className="mt-2 block h-11 w-full border border-ink/15 bg-white px-3 text-[14px] text-ink focus:border-vermilion focus:outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-label text-ink-mid">
              Quarter
            </span>
            <select
              name="quarter"
              defaultValue={currentQuarter}
              className="mt-2 block h-11 w-full border border-ink/15 bg-white px-3 text-[14px] text-ink focus:border-vermilion focus:outline-none"
            >
              {quarters.map((q) => (
                <option key={q} value={q}>
                  Q{q} ({quarterLabel(q)})
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="mt-6 inline-flex h-11 items-center gap-2 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download CSV
        </button>
      </form>

      {/* Reading guide — explains what each block in the CSV is for so
       *  Sofia (or her accountant) doesn't need a separate doc. */}
      <section className="mt-10 border-t border-ink/10 pt-8">
        <h2 className="font-display text-[20px] leading-tight text-ink">
          What's in the file
        </h2>
        <dl className="mt-5 space-y-4 text-[13px] leading-relaxed">
          <div>
            <dt className="font-display text-[14px] text-ink">SUMMARY block</dt>
            <dd className="mt-1 text-ink-mid">
              Per-country roll-up. <strong>Net (incl. VAT)</strong> is the
              figure that goes on the BTW form — gross invoiced minus credit
              notes. The BE row maps to rooster 03 (domestic 21%); other
              countries map to rooster 49 (intra-EU B2C / OSS).
            </dd>
          </div>
          <div>
            <dt className="font-display text-[14px] text-ink">INVOICES block</dt>
            <dd className="mt-1 text-ink-mid">
              Every invoice issued in the period. One row each: number, date,
              order, country, ex-VAT subtotal, VAT, shipping, grand total,
              rate. INV numbers stay sequential — gaps would trigger an
              audit question.
            </dd>
          </div>
          <div>
            <dt className="font-display text-[14px] text-ink">CREDIT NOTES block</dt>
            <dd className="mt-1 text-ink-mid">
              Every credit note issued in the period, with the original
              invoice it references. Belgian Code TVA Art. 53octies — that
              cross-reference is the legal anchor. Reason column shows
              RETURN / CANCELLATION / GOODWILL / etc.
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-[12px] text-ink-mid">
          Filing portal:{" "}
          <Link
            href="https://financien.belgium.be/fr/E-services/intervat"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-vermilion underline-offset-4 hover:text-vermilion"
          >
            Belgian FPS Finance · INTERVAT
          </Link>
        </p>
      </section>
    </div>
  );
}

function quarterLabel(q: number): string {
  switch (q) {
    case 1: return "Jan – Mar";
    case 2: return "Apr – Jun";
    case 3: return "Jul – Sep";
    case 4: return "Oct – Dec";
    default: return "";
  }
}
