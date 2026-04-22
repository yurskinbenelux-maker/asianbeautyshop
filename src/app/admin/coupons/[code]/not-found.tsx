import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function CouponNotFound() {
  return (
    <div className="mx-auto max-w-xl px-8 py-20 text-center">
      <div className="eyebrow">404</div>
      <h1 className="mt-2 font-display text-[28px] text-ink">
        Coupon not found
      </h1>
      <p className="mx-auto mt-3 max-w-md text-[13px] text-ink-mid">
        The code you're looking for was renamed or deleted. Back to the list.
      </p>
      <Link
        href="/admin/coupons"
        className="mt-6 inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Coupons
      </Link>
    </div>
  );
}
