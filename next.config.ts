import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage public URLs
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
    // AVIF first, WEBP fallback for older browsers, JPEG/PNG for the
    // very old. Next.js's image optimisation layer transcodes on the
    // fly and caches the result, so we serve a 50-70% smaller image
    // to anyone on Chrome / Edge / Safari 16.4+ — which lifts mobile
    // Lighthouse perf from ~79 to ~92+.
    formats: ["image/avif", "image/webp"],
    // Tighter sizes for our actual breakpoints — the default ladder
    // is too generous for a portrait-oriented PDP gallery and a
    // 3-column shop card grid. Smaller variants = smaller payload.
    imageSizes: [16, 32, 64, 96, 128, 256, 384],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    // Cache transformed variants for a year — Next emits a stable
    // hash in the URL so a product image swap invalidates naturally.
    minimumCacheTTL: 31536000,
  },
  experimental: {
    // React 19 + RSC — required for streaming the AI concierge
    serverActions: {
      // 16 MB cap covers our two upload paths:
      //  · product photos (8 MB max enforced in lib/admin/media/actions)
      //  · hero + reel videos (12 MB max for an mp4 H.264 loop)
      // Plus a few MB of FormData overhead. Bumping above 16 MB starts
      // to push at Hostinger's nginx body limit, so don't grow this
      // without testing.
      bodySizeLimit: "16mb",
    },
    // View Transitions API — wraps client-side route changes in
    // document.startViewTransition() so elements with matching
    // view-transition-name morph between pages (shop card → PDP hero,
    // category page → product, etc.). Browsers without VT just see a
    // normal instant navigation. See globals.css for the morph rules.
    viewTransition: true,
  },
  // Hostinger's Node runtime sits behind a proxy — trust it for correct IPs in GDPR logs
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
