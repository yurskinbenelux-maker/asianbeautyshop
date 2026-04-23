import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2, ExternalLink } from "lucide-react";
import { getAdminRedirect } from "@/lib/redirects/db";
import { RedirectForm } from "@/components/admin/redirects/redirect-form";
import { updateRedirectAction, deleteRedirectAction } from "../actions";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = { params: Promise<{ id: string }> };

export default async function EditRedirectPage({ params }: Props) {
  const { id } = await params;
  const row = await getAdminRedirect(id);
  if (!row) notFound();

  const isAuto = row.source?.startsWith("auto:") ?? false;

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <Link
        href="/admin/redirects"
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All redirects
      </Link>

      <header className="mb-8 mt-4">
        <div className="eyebrow">Redirects</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Edit redirect
        </h1>
        {isAuto && (
          <p className="mt-3 border border-gold/30 bg-gold/5 px-3 py-2 text-[12px] text-ink">
            This row was auto-inserted when a slug changed. Editing it will
            mark it as <strong>manual</strong>.
          </p>
        )}
      </header>

      <RedirectForm action={updateRedirectAction} initial={row} />

      <section className="mt-10 border-t border-ink/10 pt-6">
        <h2 className="text-[11px] uppercase tracking-label text-ink-mid">
          Activity
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
          <dt className="text-ink-mid">Hits</dt>
          <dd className="text-ink">{row.hits}</dd>
          <dt className="text-ink-mid">Last hit</dt>
          <dd className="text-ink">
            {row.lastHitAt ? DATE.format(row.lastHitAt) : "—"}
          </dd>
          <dt className="text-ink-mid">Created</dt>
          <dd className="text-ink">{DATE.format(row.createdAt)}</dd>
          <dt className="text-ink-mid">Updated</dt>
          <dd className="text-ink">{DATE.format(row.updatedAt)}</dd>
        </dl>

        <div className="mt-6 flex items-center gap-4">
          <a
            href={row.toPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Test destination
          </a>
        </div>
      </section>

      <section className="mt-10 border-t border-vermilion/20 pt-6">
        <h2 className="text-[11px] uppercase tracking-label text-vermilion">
          Danger zone
        </h2>
        <form action={deleteRedirectAction} className="mt-3">
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-vermilion/40 bg-white px-4 py-2 text-[12px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete redirect
          </button>
          <p className="mt-2 text-[11px] text-ink-mid">
            Removing a permanent redirect can hurt SEO if the old URL still
            earns traffic.
          </p>
        </form>
      </section>
    </div>
  );
}
