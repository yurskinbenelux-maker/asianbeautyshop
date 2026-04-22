// ─────────────────────────────────────────────────────────────────────────
// <JsonLd> — inline a schema.org object as an application/ld+json script.
//
// Server component. Safe by construction: we pass a JS object through
// JSON.stringify, so any untrusted substrings are escaped for us. Never
// pass pre-built strings here — stringify is what guards against
// HTML-injection via review names, product titles, etc.
//
// We replace `<` with `\u003c` defensively to neutralise the `</script>`
// escape hatch in case a payload ever contains that substring.
// ─────────────────────────────────────────────────────────────────────────

export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // Using dangerouslySetInnerHTML is the documented Next.js pattern for
      // JSON-LD — React will otherwise JSX-encode the braces and break the
      // script body.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
