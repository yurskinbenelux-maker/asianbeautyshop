// ─────────────────────────────────────────────────────────────────────────
// Root-level error boundary. Next.js requires this because our root
// layout is a passthrough — without a global-error page that ships its
// own <html>/<body>, the framework has nothing to render when a server
// component throws, and dev shows "missing required error components,
// refreshing…" in an infinite loop.
//
// This file only renders when the error happens ABOVE the next-intl layout
// (i.e. in the root layout or when a segment can't mount). Route-level
// errors should get their own error.tsx files in future.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the terminal so Max can see the real cause during dev.
    // eslint-disable-next-line no-console
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f1ea", // rice
          color: "#111",
          fontFamily:
            "ui-serif, Georgia, 'Times New Roman', Times, serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "520px" }}>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: "12px",
            }}
          >
            Something went wrong
          </div>
          <h1
            style={{
              fontSize: "34px",
              lineHeight: 1.1,
              margin: "0 0 16px 0",
            }}
          >
            We couldn't render this page.
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#444",
              margin: "0 0 24px 0",
            }}
          >
            The server threw an error while preparing the page. The details
            are in the terminal where <code>npm run dev</code> is running.
          </p>

          {process.env.NODE_ENV === "development" && (
            <pre
              style={{
                fontSize: "12px",
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.1)",
                padding: "12px",
                overflow: "auto",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                marginBottom: "24px",
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          )}

          <button
            onClick={() => reset()}
            style={{
              fontSize: "12px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              background: "transparent",
              border: 0,
              padding: 0,
              color: "#111",
              textDecoration: "underline",
              textDecorationColor: "#d84c2a", // vermilion
              textUnderlineOffset: "6px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
