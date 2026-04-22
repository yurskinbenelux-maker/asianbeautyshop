// ─────────────────────────────────────────────────────────────────────────
// Root layout stub. The real layout lives at src/app/[locale]/layout.tsx
// so next-intl can hydrate messages. Next.js requires *some* root layout,
// so we render a passthrough here. Never edit to add providers.
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
