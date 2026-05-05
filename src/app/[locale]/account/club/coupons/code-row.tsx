"use client";

// ─────────────────────────────────────────────────────────────────────────
// CouponCodeRow — single row in the My coupons list. Shows the code in
// monospace, the value, expiry, and a Copy-to-clipboard button.
//
// Highlighted state (vermilion ring) flags the code that just got minted
// from /account/club/redeem, so the customer's eye lands on it without
// having to scan.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { DiscountKind } from "@prisma/client";

export function CouponCodeRow({
  code,
  kind,
  value,
  endsAt,
  redeemed,
  expired,
  highlighted,
}: {
  code: string;
  kind: DiscountKind;
  value: number;
  endsAt: string | null;
  redeemed: boolean;
  expired: boolean;
  highlighted?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        /* fallback: code is visible on screen */
      },
    );
  }

  const valueLabel =
    kind === "PERCENT"
      ? `${value}% off`
      : kind === "FIXED"
        ? `€${value.toFixed(2)} off`
        : "Free shipping";

  const expiryLabel = endsAt
    ? new Date(endsAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const stale = redeemed || expired;

  return (
    <li
      className={
        "flex items-center justify-between gap-4 px-5 py-4 " +
        (highlighted ? "bg-vermilion/5" : "") +
        (stale ? " opacity-60" : "")
      }
    >
      <div className="min-w-0">
        <code className="font-mono text-[15px] tracking-[0.14em] text-ink">
          {code}
        </code>
        <p className="mt-0.5 text-[12px] text-ink-mid">
          {valueLabel}
          {expiryLabel ? (
            <>
              <span className="mx-2 text-ink-mid">·</span>
              {redeemed
                ? "Used"
                : expired
                  ? `Expired ${expiryLabel}`
                  : `Valid until ${expiryLabel}`}
            </>
          ) : null}
        </p>
      </div>
      {!stale ? (
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-[11px] uppercase tracking-label text-vermilion transition-colors hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
    </li>
  );
}
