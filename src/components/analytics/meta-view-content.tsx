"use client";

import { useEffect } from "react";
import { trackViewContent } from "@/lib/analytics/meta-pixel";

type Props = {
  product: {
    id: string;
    name?: string;
    price?: number;
    currency?: string;
    category?: string;
  };
};

export function MetaViewContent({ product }: Props) {
  useEffect(() => {
    trackViewContent(product);
  }, [product.id]);

  return null;
}
