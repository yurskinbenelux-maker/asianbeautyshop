// ─────────────────────────────────────────────────────────────────────────
// CertificationsStrip — a small typographic trust-signal row.
//
// Shows the four regulatory / quality certifications Asian Beauty Shop carries, as
// called out in the HQ brand doc:
//   · CPNP     — EU Cosmetic Products Notification Portal
//   · ECAS     — Emirates Conformity Assessment Scheme
//   · Montaji  — Dubai Municipality Authority registration
//   · GMP      — Good Manufacturing Practice
//
// Intentionally minimal: no logos, no badges — just typography + hairline
// rule, to stay in the editorial register. Re-usable on /about and the
// footer / any future trust-section placement. Keep the expansion on
// first mount so screen readers announce the full names, not just the
// acronyms.
// ─────────────────────────────────────────────────────────────────────────

type Cert = {
  short: string;
  full: string;
};

const CERTIFICATIONS: readonly Cert[] = [
  { short: "CPNP", full: "EU Cosmetic Products Notification Portal" },
  { short: "ECAS", full: "Emirates Conformity Assessment Scheme" },
  { short: "Montaji", full: "Dubai Municipality Authority" },
  { short: "GMP", full: "Good Manufacturing Practice" },
];

export function CertificationsStrip({
  className = "",
}: {
  className?: string;
}) {
  return (
    <section
      className={`border-t border-ink/10 pt-8 ${className}`}
      aria-labelledby="certifications-heading"
    >
      <h2
        id="certifications-heading"
        className="text-[11px] uppercase tracking-label text-ink-mid"
      >
        Certifications &amp; compliance
      </h2>

      <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
        {CERTIFICATIONS.map((c) => (
          <li key={c.short}>
            {/*
              <abbr> gives SR an accessible expansion of the acronym;
              dotted underline is the default UA styling — we leave it so
              sighted users can tell there's a tooltip on hover.
            */}
            <div className="font-display text-[20px] leading-none text-ink">
              <abbr title={c.full}>{c.short}</abbr>
            </div>
            <div className="mt-2 text-[11px] leading-snug text-ink-mid">
              {c.full}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
