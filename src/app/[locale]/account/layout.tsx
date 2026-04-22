// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/* shared layout.
//
// Every descendant page inherits:
//   • auth guard — not signed in?  bounce to /[locale]/sign-in?next=…
//   • sidebar navigation with profile header + sign-out
//   • consistent max-width + padding for page content
//
// Child pages only need to render their own content area.
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireCustomer } from "@/lib/auth";
import { AccountSidebar } from "@/components/account/sidebar";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return {
    title: t("eyebrow"),
    robots: { index: false, follow: false },
  };
}

export default async function AccountLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Guard: redirects to /[locale]/sign-in?next=/[locale]/account if needed.
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account",
  });

  const userName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || profile.email;

  return (
    <div className="container py-10 md:py-16">
      <div className="flex flex-col gap-10 md:flex-row md:gap-12">
        <AccountSidebar
          locale={locale}
          userName={userName}
          userEmail={profile.email}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
