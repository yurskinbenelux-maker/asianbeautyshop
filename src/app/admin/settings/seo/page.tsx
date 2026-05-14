import { readSetting } from "@/lib/settings";
import { SeoForm } from "@/components/admin/settings/seo-form";
import { SettingsHeader } from "@/components/admin/settings/settings-chrome";

export const dynamic = "force-dynamic";

export default async function SeoSettingsPage() {
  const initial = await readSetting("seo");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <SettingsHeader
        eyebrow="Settings"
        title="SEO"
        description="Site-wide defaults for search engines and social link previews. Individual pages can still override these."
      />
      <div className="mt-10">
        <SeoForm initial={initial} />
      </div>
    </div>
  );
}
