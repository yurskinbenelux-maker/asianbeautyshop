// ─────────────────────────────────────────────────────────────────────────
// VAT YTD widget — sits on the /admin overview, tracks BE-domestic and
// cross-border (NL/FR/LU/DE) revenue YTD, and warns an admin when she's
// approaching the EU OSS €10,000 threshold.
//
// State colours:
//   safe     — under €7,500 cross-border, calm cream card
//   amber    — €7,500–€9,499, warm warning copy
//   red      — €9,500–€9,999, urgent copy: "register OSS now"
//   exceeded — €10,000+, big vermilion banner: "URGENT — OSS required"
//
// The widget is a server component — accepts a fully-resolved snapshot,
// no fetching of its own.
// ─────────────────────────────────────────────────────────────────────────

import { AlertTriangle, Globe, MapPin, FileDown } from "lucide-react";
import Link from "next/link";
import type { VatYtdSnapshot } from "@/lib/queries/vat-ytd";

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const COUNTRY_LABEL: Record<string, string> = {
  BE: "Belgium",
  NL: "Netherlands",
  FR: "France",
  LU: "Luxembourg",
  DE: "Germany",
};

export function VatYtdWidget({ snapshot }: { snapshot: VatYtdSnapshot }) {
  const {
    domesticEur,
    crossBorderEur,
    perCountry,
    creditsEur,
    thresholdEur,
    status,
    year,
  } = snapshot;
  const pct = Math.min(
    100,
    Math.round((crossBorderEur / thresholdEur) * 100),
  );

  const barTone = {
    safe: "bg-celadon",
    amber: "bg-yellow-600",
    red: "bg-vermilion",
    exceeded: "bg-vermilion",
  }[status];

  const cardTone = {
    safe: "border-ink/10 bg-white/60",
    amber: "border-yellow-600/40 bg-yellow-50/40",
    red: "border-vermilion/40 bg-vermilion/5",
    exceeded: "border-vermilion bg-vermilion/10",
  }[status];

  const crossBorderCountries = perCountry.filter((c) => c.country !== "BE");

  return (
    <article className={`border ${cardTone} p-6 md:p-8 transition-colors`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">VAT · Year to date</div>
          <h2 className="mt-2 font-display text-[24px] leading-tight text-ink">
            Cross-border revenue tracker
          </h2>
          {/* Disclose the time window + ledger so it doesn't get
           *  confused with the "Last 30 days" revenue strip below.
           *  This widget reads from the Invoice ledger (net of credit
           *  notes), Jan 1 → today, because that's what determines OSS
           *  threshold compliance. The 30d strip reads from Order. */}
          <p className="mt-1 text-[11px] text-ink-mid">
            Net invoiced revenue · Jan 1 – {year} · drives OSS €10k threshold
          </p>
        </div>
        {status === "exceeded" ? (
          <span className="inline-flex items-center gap-2 bg-vermilion px-3 py-1.5 text-[10px] uppercase tracking-label text-rice">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            OSS required by law
          </span>
        ) : status === "red" ? (
          <span className="inline-flex items-center gap-2 border border-vermilion px-3 py-1.5 text-[10px] uppercase tracking-label text-vermilion">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Register OSS now
          </span>
        ) : status === "amber" ? (
          <span className="inline-flex items-center gap-2 border border-yellow-600 px-3 py-1.5 text-[10px] uppercase tracking-label text-yellow-700">
            Approaching threshold
          </span>
        ) : null}
      </header>

      {/* Totals row */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
            <MapPin className="h-3 w-3" aria-hidden />
            Belgium
          </div>
          <div className="mt-2 font-display text-[32px] leading-none text-ink">
            {EUR.format(domesticEur)}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-mid">
            Domestic — taxed at 21% BE VAT, no OSS impact.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
            <Globe className="h-3 w-3" aria-hidden />
            Cross-border (NL · FR · LU · DE)
          </div>
          <div className="mt-2 font-display text-[32px] leading-none text-ink">
            {EUR.format(crossBorderEur)}
            <span className="ml-2 text-[14px] text-ink-mid">
              / {EUR.format(thresholdEur)}
            </span>
          </div>

          <div
            className="mt-3 h-1.5 w-full overflow-hidden bg-ink/8"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`${barTone} h-full transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Per-country breakdown — only when there's cross-border activity */}
      {crossBorderCountries.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/10 pt-4">
          {crossBorderCountries.map((c) => (
            <div
              key={c.country}
              className="flex items-baseline gap-2 text-[12px]"
            >
              <span className="text-ink-mid">
                {COUNTRY_LABEL[c.country] ?? c.country}
              </span>
              <span className="text-ink">{EUR.format(c.eur)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Credits issued — audit-trail line so the figure above is
       *  obviously net-of-refunds rather than gross. Only render when
       *  there's something to show; a year with zero refunds doesn't
       *  need this row cluttering the card. */}
      {creditsEur > 0 ? (
        <p className="mt-4 text-[11px] text-ink-mid">
          Credits issued this year:{" "}
          <span className="text-ink">{EUR.format(creditsEur)}</span>
          {" "}— already subtracted from totals above.
        </p>
      ) : null}

      {/* Quarterly export CTA (G6) — accountant's "give me the BTW
       *  filing data" entry point. Always visible (even pre-launch
       *  when there's no data yet) so admins know it exists. */}
      <Link
        href="/admin/vat-export"
        className="mt-5 inline-flex items-center gap-2 border border-ink/15 bg-white px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-vermilion hover:text-vermilion"
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        Quarterly BTW export
      </Link>

      {/* State copy */}
      <div className="mt-6 border-t border-ink/10 pt-4 text-[12px] leading-relaxed">
        {status === "safe" ? (
          <p className="text-ink-mid">
            Safely under the €10,000 OSS threshold for cross-border B2C
            sales. Continue charging Belgian VAT (21%) on all orders.
          </p>
        ) : status === "amber" ? (
          <p className="text-ink">
            <strong>Approaching the EU OSS threshold.</strong> Once
            cross-border revenue reaches €10,000, you must register for
            OSS via the Belgian FPS Finance portal and start charging
            destination-country VAT rates. Plan to register within the
            next 4–8 weeks.
          </p>
        ) : status === "red" ? (
          <p className="text-ink">
            <strong>About to cross the €10,000 OSS threshold.</strong>{" "}
            Register for OSS now via{" "}
            <a
              href="https://financien.belgium.be/fr/E-services/intervat-oss"
              target="_blank"
              rel="noreferrer"
              className="text-vermilion underline decoration-vermilion underline-offset-4"
            >
              Belgian FPS Finance OSS portal
            </a>{" "}
            so the registration is active before you exceed the
            threshold. Once registered, swap to destination-country VAT
            rates (NL 21%, FR 20%, LU 17%, DE 19%).
          </p>
        ) : (
          <p className="font-medium text-vermilion">
            URGENT — Cross-border B2C sales have exceeded €10,000 this
            year. EU law (Council Directive 2006/112/EC, art. 369)
            requires immediate OSS registration. Register at{" "}
            <a
              href="https://financien.belgium.be/fr/E-services/intervat-oss"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-vermilion underline-offset-4"
            >
              Belgian FPS Finance OSS portal
            </a>{" "}
            and stop issuing Belgian-only VAT invoices to NL/FR/LU/DE
            customers.
          </p>
        )}
      </div>
    </article>
  );
}
