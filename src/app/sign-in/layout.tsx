// ─────────────────────────────────────────────────────────────────────────
// Sign-in layout — own <html> + fonts, no nav/footer, no i18n provider.
// (Admin panel is English-only; the public site has its own layout.)
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "../globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sign in · Asian Beauty Shop",
  robots: { index: false, follow: false },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-rice">{children}</body>
    </html>
  );
}
