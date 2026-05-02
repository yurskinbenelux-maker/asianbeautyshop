// ─────────────────────────────────────────────────────────────────────────
// AddressAutocomplete — Google Places-powered suggestions for the
// shipping address line1 field on /checkout. When the user picks a
// suggestion we populate line1, city, postcode and country in one go,
// shaving ~30 seconds off mobile checkout.
//
// Setup:
//   • Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY on Hostinger (Maps JS + Places
//     API enabled in Google Cloud, restricted to *.yurskinsolution.eu).
//   • Without the key, this component degrades to a plain input — the
//     existing form keeps working unchanged.
//
// Why the new "PlaceAutocompleteElement" web component (not the old
// `Autocomplete()` constructor): Google deprecated the JS class in
// 2024 and the new HTML element is the supported path going forward.
// It's a Web Component you drop into the DOM and listen for
// `gmp-placeselect` events on. We wrap it in a React-friendly shape.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: unknown;
    /** Set by us to gate concurrent loads of the Maps JS bundle. */
    __yurMapsLoading?: Promise<void>;
  }
}

const SCRIPT_ID = "google-maps-places";

/**
 * Lazy-load the Google Maps JS SDK exactly once per page. Returns a
 * promise that resolves when window.google.maps.places is ready.
 * Without an API key, returns a rejected promise so the caller can
 * fall back to a plain <input>.
 */
function loadGooglePlaces(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ssr"));
  }
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("no-key"));

  // Already loaded.
  if ((window as { google?: { maps?: { places?: unknown } } }).google?.maps?.places) {
    return Promise.resolve();
  }
  if (window.__yurMapsLoading) return window.__yurMapsLoading;

  window.__yurMapsLoading = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${encodeURIComponent(key)}` +
      `&libraries=places` +
      `&v=weekly` +
      `&loading=async`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load"));
    document.head.appendChild(script);
  });
  return window.__yurMapsLoading;
}

type ParsedAddress = {
  line1: string; // "Rue de la Loi 16"
  city: string;
  postcode: string;
  country: string; // ISO-3166 alpha-2
  region: string | null;
};

/** Walk a Google place's address_components and pick the bits we need. */
function parsePlace(
  place: Record<string, unknown> | null,
): ParsedAddress | null {
  if (!place) return null;
  const components = (place.address_components ?? place.addressComponents) as
    | Array<{
        long_name?: string;
        short_name?: string;
        types?: string[];
        longText?: string;
        shortText?: string;
      }>
    | undefined;
  if (!components) return null;

  const get = (type: string, short = false): string | null => {
    const c = components.find((x) => x.types?.includes(type));
    if (!c) return null;
    return short
      ? c.short_name ?? c.shortText ?? null
      : c.long_name ?? c.longText ?? null;
  };

  const streetNumber = get("street_number") ?? "";
  const route = get("route") ?? "";
  // "Boomsesteenweg 41" — number after street name. Some locales (e.g.
  // PT) put it before — Google still tags components correctly.
  const line1 = [route, streetNumber].filter(Boolean).join(" ").trim();

  const country = get("country", true) ?? "";
  const city =
    get("locality") ??
    get("postal_town") ??
    get("administrative_area_level_2") ??
    "";
  const postcode = get("postal_code") ?? "";
  const region = get("administrative_area_level_1");

  if (!line1 || !country) return null;
  return { line1, city, postcode, country, region };
}

type Props = {
  /** Form field name — defaults to shipping.line1 to match checkout schema. */
  name?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Called when a suggestion is picked. Use to set the rest of the form. */
  onAddressPicked?: (address: ParsedAddress) => void;
  /** Restrict suggestions to specific country codes (lowercase). */
  countryAllowList?: string[];
};

export function AddressAutocomplete({
  name = "shipping.line1",
  defaultValue,
  required,
  placeholder,
  className,
  onAddressPicked,
  countryAllowList = ["be", "nl", "fr", "lu", "de"],
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [autocompleteReady, setAutocompleteReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGooglePlaces()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        // Reach for the legacy `Autocomplete` class — the newer web
        // component requires a tag swap and we want to stay inside an
        // <input> so the existing form/FormData flow keeps working.
        const w = window as unknown as {
          google?: {
            maps?: {
              places?: {
                Autocomplete?: new (
                  el: HTMLInputElement,
                  options: Record<string, unknown>,
                ) => {
                  addListener: (event: string, fn: () => void) => void;
                  getPlace: () => Record<string, unknown>;
                };
              };
            };
          };
        };
        const Auto = w.google?.maps?.places?.Autocomplete;
        if (!Auto) return;

        const autocomplete = new Auto(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: countryAllowList },
          fields: ["address_components", "formatted_address"],
        });
        autocomplete.addListener("place_changed", () => {
          const parsed = parsePlace(autocomplete.getPlace());
          if (parsed && onAddressPicked) onAddressPicked(parsed);
        });
        setAutocompleteReady(true);
      })
      .catch(() => {
        // No key / load failed — leave the plain <input> in place.
      });
    return () => {
      cancelled = true;
    };
  }, [countryAllowList, onAddressPicked]);

  return (
    <input
      ref={inputRef}
      type="text"
      name={name}
      defaultValue={defaultValue}
      required={required}
      placeholder={placeholder}
      autoComplete="address-line1"
      className={cn(className)}
      data-autocomplete-state={autocompleteReady ? "ready" : "pending"}
    />
  );
}
