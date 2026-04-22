// ─────────────────────────────────────────────────────────────────────────
// /admin/emails — template index.
//
// A grid of every transactional email the shop can send, grouped by
// audience. Each card links to /admin/emails/[key] for a full visual
// preview + send-test-to-my-inbox.
//
// Sofia should open this before launch (and any time we change a template)
// to confirm the emails look right in EN/NL/FR/RU before customers see
// them.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { EMAIL_TEMPLATES, type EmailTemplate } from "./registry";

export const dynamic = "force-dynamic";

export default function EmailsIndexPage() {
  const customerTemplates = EMAIL_TEMPLATES.filter(
    (t) => t.audience === "customer",
  );
  const adminTemplates = EMAIL_TEMPLATES.filter(
    (t) => t.audience === "admin",
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header>
        <div className="eyebrow">Email</div>
        <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
          Emails
        </h1>
        <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
          Preview every transactional email and send yourself a test copy
          before customers see it. Changes to the underlying templates will
          appear here on the next page refresh.
        </p>
      </header>

      {/* Customer-facing group ──────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-center gap-2 border-b border-ink/10 pb-3">
          <Mail className="h-3.5 w-3.5 text-ink-mid" />
          <h2 className="text-[11px] uppercase tracking-label text-ink-mid">
            Customer emails
          </h2>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {customerTemplates.map((t) => (
            <TemplateCard key={t.key} template={t} />
          ))}
        </div>
      </section>

      {/* Admin-facing group ─────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="flex items-center gap-2 border-b border-ink/10 pb-3">
          <ShieldCheck className="h-3.5 w-3.5 text-ink-mid" />
          <h2 className="text-[11px] uppercase tracking-label text-ink-mid">
            Internal emails
          </h2>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {adminTemplates.map((t) => (
            <TemplateCard key={t.key} template={t} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TemplateCard({ template }: { template: EmailTemplate }) {
  return (
    <Link
      href={`/admin/emails/${template.key}`}
      className="group block border border-ink/10 bg-white/60 p-5 transition-colors hover:border-ink"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-[17px] leading-tight text-ink">
            {template.label}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">
            {template.description}
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-label text-ink-mid">
            <span>{template.localised ? "EN · NL · FR · RU" : "EN only"}</span>
          </div>
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-ink-mid transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden
        />
      </div>
    </Link>
  );
}
