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
      // Stable action IDs across builds + worker processes.
      //
      // Server Actions are referenced by hash. Without a fixed key,
      // Next.js generates a new hash per build and per worker process,
      // so:
      //   · A page held open from before a redeploy points at the OLD
      //     action id; the new server bundle doesn't recognise it →
      //     "Server Action ... was not found on the server".
      //   · Hostinger's Node clustering can run >1 worker with
      //     different action maps; round-robin'd requests fail
      //     intermittently for the same reason.
      //
      // Setting NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (a base64-encoded
      // 32-byte secret) on the Hostinger env panel makes the hashes
      // deterministic — old tabs still 404 after a deploy (the action
      // signature genuinely changed if an admin edited the form), but
      // workers stay in lockstep and routine redeploys stop breaking
      // open tabs unless the action body actually changed.
      //
      // The encryptionKey value is read from env at runtime — see
      // https://nextjs.org/docs/app/api-reference/next-config-js/serverActions
      // We don't reference process.env here so the absence of the env
      // var falls through to the auto-generated default in dev.
    },
    // View Transitions API — wraps client-side route changes in
    // document.startViewTransition() so elements with matching
    // view-transition-name morph between pages (shop card → PDP hero,
    // category page → product, etc.). Browsers without VT just see a
    // normal instant navigation. See globals.css for the morph rules.
    viewTransition: true,
  },
  // pdfkit (used by /api/webhooks/mollie → issueInvoiceForOrder →
  // renderInvoicePdf) reads its standard-font metrics (Helvetica.afm,
  // Helvetica-Bold.afm, etc.) from disk at runtime via __dirname.
  // Next.js's automatic dependency tracing doesn't follow that pattern
  // — the .afm files aren't picked up as imports — so they get left
  // out of the Hostinger production bundle and PDF rendering throws
  // ENOENT: no such file or directory ... Helvetica.afm.
  //
  // outputFileTracingIncludes pins those files into the deploy. The
  // wildcard route key '*' applies to every API route + server file
  // so we don't have to enumerate each consumer of pdfkit.
  //
  // If we ever switch off pdfkit (e.g. to puppeteer or react-pdf),
  // this entry can be removed.
  outputFileTracingIncludes: {
    "*": ["./node_modules/pdfkit/js/data/**/*"],
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
