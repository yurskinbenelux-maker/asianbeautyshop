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
  },
  experimental: {
    // React 19 + RSC — required for streaming the AI concierge
    serverActions: {
      bodySizeLimit: "10mb", // product photos travel through the server action on upload
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
