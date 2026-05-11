// ─────────────────────────────────────────────────────────────────────────
// i18n request config — loads the right message bundle for the active locale.
// next-intl calls this on every request (RSC-safe).
// ─────────────────────────────────────────────────────────────────────────

import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Fallback to default if the URL locale is missing/invalid
  if (!locale || !routing.locales.includes(locale as typeof routing.locales[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Europe/Brussels — an admin is in Aartselaar, BE. Keep times consistent.
    timeZone: "Europe/Brussels",
  };
});
