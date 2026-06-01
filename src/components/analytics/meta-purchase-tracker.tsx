"use client";

import { useEffect, useRef } from "react";
import { trackPurchase } from "@/lib/analytics/meta-pixel";

type Props = {
  purchase: {
    orderId: string;
    value: number;
    currency: string;
    contentIds: string[];
    numItems: number;
  };
};

export function MetaPurchaseTracker({ purchase }: Props) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (hasTracked.current) return;
    hasTracked.current = true;

    trackPurchase({
      orderId: purchase.orderId,
      value: purchase.value,
      currency: purchase.currency,
      contentIds: purchase.contentIds,
      numItems: purchase.numItems,
    });
  }, [
    purchase.orderId,
    purchase.value,
    purchase.currency,
    purchase.contentIds,
    purchase.numItems,
  ]);

  return null;
}
