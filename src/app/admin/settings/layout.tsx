// Layout for /admin/settings/* — shared sub nav. Each section lives under
// its own folder so URLs stay bookmarkable (e.g. /admin/settings/shipping).
//
// Owner-only: settings contain financial config (VAT rate, shipping rates,
// Stripe/Mollie keys), SEO that shapes the whole site, and the AI
// assistant prompt. Editors and fulfilment staff have no business being
// in here — we redirect them to /no-access at the layout level so the
// guard applies to every settings sub-page without us having to repeat
// it in five different files.

import type { ReactNode } from "react";
import { SettingsSubNav } from "@/components/admin/settings/settings-sub-nav";
import { requireCapability } from "@/lib/auth-roles";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireCapability("settings.view");
  return (
    <>
      <SettingsSubNav />
      {children}
    </>
  );
}
