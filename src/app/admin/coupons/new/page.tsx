import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CouponForm } from "@/components/admin/coupons/coupon-form";

export const dynamic = "force-dynamic";

export default function NewCouponPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/coupons"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Coupons
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">New coupon</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Create a discount code
        </h1>
        <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
          Codes are case-insensitive for customers, but stored in uppercase.
          You can change any of these fields later.
        </p>
      </header>
      <CouponForm mode="create" />
    </div>
  );
}
