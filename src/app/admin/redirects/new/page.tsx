import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RedirectForm } from "@/components/admin/redirects/redirect-form";
import { createRedirectAction } from "../actions";

export default function NewRedirectPage() {
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
          New redirect
        </h1>
      </header>
      <RedirectForm action={createRedirectAction} />
    </div>
  );
}
