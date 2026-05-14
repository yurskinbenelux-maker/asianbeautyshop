import Link from "next/link";

export default function RedirectNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-8 md:py-16 text-center">
      <h1 className="font-display text-[28px] text-ink">Redirect not found</h1>
      <p className="mt-3 text-[13px] text-ink-mid">
        It may have been deleted.
      </p>
      <Link
        href="/admin/redirects"
        className="mt-6 inline-block text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4"
      >
        Back to all redirects
      </Link>
    </div>
  );
}
