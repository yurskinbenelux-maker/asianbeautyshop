import { readSetting } from "@/lib/settings";
import { StoreForm } from "@/components/admin/settings/store-form";
import { SettingsHeader } from "@/components/admin/settings/settings-chrome";

export const dynamic = "force-dynamic";

export default async function StoreSettingsPage() {
  const initial = await readSetting("store");
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <SettingsHeader
        eyebrow="Settings"
        title="Store"
        description="Public-facing store details used in the header, footer, and transactional emails."
      />
      <div className="mt-10">
        <StoreForm initial={initial} />
      </div>
    </div>
  );
}
