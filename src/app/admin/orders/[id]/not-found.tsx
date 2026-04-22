// Minimal 404 for a missing admin order — avoids the generic app-level 404.
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-24 text-center">
      <div className="eyebrow">Orders</div>
      <h1 className="mt-3 font-display text-[34px] text-ink">
        Order not found
      </h1>
      <p className="mt-3 text-[13px] text-ink-mid">
        It may have been removed, or the link is stale.
      </p>
      <Link
        href="/admin/orders"
        className="mt-8 inline-block border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        Back to orders
      </Link>
    </div>
  );
}
