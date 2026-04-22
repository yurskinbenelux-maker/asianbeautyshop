import { readSetting } from "@/lib/settings";
import { ShippingForm } from "@/components/admin/settings/shipping-form";
import { SettingsHeader } from "@/components/admin/settings/settings-chrome";

export const dynamic = "force-dynamic";

export default async function ShippingSettingsPage() {
  const initial = await readSetting("shipping");
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <SettingsHeader
        eyebrow="Settings"
        title="Shipping"
        description="Flat shipping rate, free-shipping threshold, and the countries you'll ship to."
      />
      <div className="mt-10">
        <ShippingForm initial={initial} />
      </div>
    </div>
  );
}
