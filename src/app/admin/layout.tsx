// ─────────────────────────────────────────────────────────────────────────
// Admin layout — own <html>, English-only, guard + sidebar + main area.
//
// This route group lives OUTSIDE /[locale] on purpose:
//   • an admin runs the shop in English, always
//   • no i18n provider or message loading to worry about
//   • still shares the design tokens via globals.css
//
// Every admin page is gated by requireAdmin() here, so individual pages
// can assume a valid admin user is present.
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "../globals.css";

import { requireAdminWithRole } from "@/lib/auth-roles";
import { AdminSidebar } from "@/components/admin/sidebar";

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
  title: "Admin · Asian Beauty Shop",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Auth guard: not signed in → /sign-in?next=/admin
  //             signed in but not on any admin allow-list → /no-access
  // The resolved role is passed to the sidebar so it can hide nav items
  // the current user doesn't have capability for. Page-level guards
  // (requireCapability) are the actual access-control layer — the sidebar
  // is just UX polish.
  const { user, role } = await requireAdminWithRole();

  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-rice text-ink antialiased">
        <div className="flex min-h-screen">
          <AdminSidebar userEmail={user.email ?? ""} role={role} />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
