import { readSetting } from "@/lib/settings";
import { TaxForm } from "@/components/admin/settings/tax-form";
import { SettingsHeader } from "@/components/admin/settings/settings-chrome";

export const dynamic = "force-dynamic";

export default async function TaxSettingsPage() {
  const initial = await readSetting("tax");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <SettingsHeader
        eyebrow="Settings"
        title="Tax"
        description="Default VAT rate and whether product prices shown to customers already include tax. Country overrides let you handle exports outside the default rate."
      />
      <div className="mt-10">
        <TaxForm initial={initial} />
      </div>
    </div>
  );
}
