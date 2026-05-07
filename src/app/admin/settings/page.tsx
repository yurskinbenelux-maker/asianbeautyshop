import { redirect } from "next/navigation";

// /admin/settings has no content of its own — an admin lands on Store by default.
export default function SettingsIndex() {
  redirect("/admin/settings/store");
}
