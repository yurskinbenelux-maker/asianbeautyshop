// ─────────────────────────────────────────────────────────────────────────
// Root-level 404. Our root layout is a passthrough so any not-found that
// bubbles above the [locale] segment has no <html>/<body> to live in.
// This file supplies one.
// ─────────────────────────────────────────────────────────────────────────

export default function NotFound() {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f1ea",
          color: "#111",
          fontFamily:
            "ui-serif, Georgia, 'Times New Roman', Times, serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "480px", textAlign: "left" }}>
          <div
            style={{
              fontSize: "11px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: "12px",
            }}
          >
            404
          </div>
          <h1
            style={{
              fontSize: "34px",
              lineHeight: 1.1,
              margin: "0 0 16px 0",
            }}
          >
            Nothing here.
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#444",
              margin: "0 0 24px 0",
            }}
          >
            The page you're looking for doesn't exist — or has moved.
          </p>
          <a
            href="/"
            style={{
              fontSize: "12px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#111",
              textDecoration: "underline",
              textDecorationColor: "#d84c2a",
              textUnderlineOffset: "6px",
            }}
          >
            Back to Asian Beauty Shop
          </a>
        </div>
      </body>
    </html>
  );
}
