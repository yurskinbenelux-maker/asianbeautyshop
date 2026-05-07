// ─────────────────────────────────────────────────────────────────────────
// Web App Manifest — generated server-side by Next's app-router
// metadata API. Served at /manifest.webmanifest. Lets visitors install
// the site as a PWA on iOS Safari (16+) and Chrome / Edge / Firefox
// on Android + desktop.
//
// Icons reuse the brand PNG set already shipped under /public/brand/
// (apple-touch-icon, icon-192, icon-512 — see #140). The 512×512 with
// `purpose: "maskable"` matches Android's adaptive-icon requirements
// so the OS can crop into the brand circle without clipping the logo.
//
// `display: "standalone"` opens the app full-screen with no browser
// chrome — feels native. `start_url: "/"` drops returning users on
// the homepage; we could parameterise to /shop for higher-intent
// installs, but homepage is the safer default.
// ─────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asian Beauty Shop",
    short_name: "ABS",
    description:
      "Considered Asian beauty, curated. Korean, Japanese and beyond — small-batch houses we trust.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8F4EC", // rice cream
    theme_color: "#B8302C", // cherry blossom red — matches the new brand mark
    lang: "en",
    dir: "ltr",
    categories: ["shopping", "lifestyle", "beauty"],
    icons: [
      {
        src: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        // Android adaptive-icon mask. Same asset works because the
        // icon sits well-centered with safe-zone padding around it.
        purpose: "maskable",
      },
    ],
    // Quick-actions shown on long-press of the home-screen icon (Android).
    shortcuts: [
      {
        name: "Shop",
        short_name: "Shop",
        url: "/shop",
        description: "Browse the collection",
      },
      {
        name: "Account",
        short_name: "Account",
        url: "/account",
      },
    ],
  };
}
