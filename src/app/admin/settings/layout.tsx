// Layout for /admin/settings/* — shared sub nav. Each section lives under
// its own folder so URLs stay bookmarkable (e.g. /admin/settings/shipping).

import type { ReactNode } from "react";
import { SettingsSubNav } from "@/components/admin/settings/settings-sub-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SettingsSubNav />
      {children}
    </>
  );
}
