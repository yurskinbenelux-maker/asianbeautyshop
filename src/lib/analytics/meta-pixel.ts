export type MetaPixelProduct = {
  id: string;
  name?: string;
  price?: number;
  currency?: string;
  category?: string;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function waitForFbqAndTrack(
  eventName: string,
  params?: Record<string, unknown>,
  attempt = 0,
) {
  if (typeof window === "undefined") return;

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params);
    return;
  }

  // Pixel script can load slightly after React effects.
  // Retry for ~5 seconds max.
  if (attempt < 25) {
    window.setTimeout(() => {
      waitForFbqAndTrack(eventName, params, attempt + 1);
    }, 200);
  }
}

export function trackMetaPixelEvent(
  eventName: string,
  params?: Record<string, unknown>,
) {
  waitForFbqAndTrack(eventName, params);
}

export function trackViewContent(product: MetaPixelProduct) {
  trackMetaPixelEvent("ViewContent", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: product.currency ?? "EUR",
    category: product.category,
  });
}

export function trackAddToCart(product: MetaPixelProduct) {
  trackMetaPixelEvent("AddToCart", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: product.currency ?? "EUR",
    category: product.category,
  });
}

export function trackInitiateCheckout(params?: {
  value?: number;
  currency?: string;
  contentIds?: string[];
  numItems?: number;
}) {
  trackMetaPixelEvent("InitiateCheckout", {
    content_ids: params?.contentIds,
    content_type: "product",
    value: params?.value,
    currency: params?.currency ?? "EUR",
    num_items: params?.numItems,
  });
}

export function trackPurchase(params: {
  value: number;
  currency?: string;
  contentIds?: string[];
  numItems?: number;
  orderId?: string;
}) {
  trackMetaPixelEvent("Purchase", {
    content_ids: params.contentIds,
    content_type: "product",
    value: params.value,
    currency: params.currency ?? "EUR",
    num_items: params.numItems,
    order_id: params.orderId,
  });
}
