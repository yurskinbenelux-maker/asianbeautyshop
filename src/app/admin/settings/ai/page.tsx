import { readSetting } from "@/lib/settings";
import { AiForm } from "@/components/admin/settings/ai-form";
import { SettingsHeader } from "@/components/admin/settings/settings-chrome";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const initial = await readSetting("ai");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <SettingsHeader
        eyebrow="Settings"
        title="AI assistant"
        description="Tune the on-site skincare concierge. Changes apply to the next conversation — live sessions keep their current system prompt."
      />
      <div className="mt-10">
        <AiForm initial={initial} />
      </div>
    </div>
  );
}
