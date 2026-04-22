// ─────────────────────────────────────────────────────────────────────────
// Shared layout for /admin/categories/* — adds a sub-nav that stays
// consistent between the Categories / Brands / Ingredients / Tags tabs.
// No auth guard here: the outer /admin layout already enforces it.
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { CategoriesSubNav } from "@/components/admin/taxonomies/sub-nav";

export default function CategoriesLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <CategoriesSubNav />
      {children}
    </div>
  );
}
