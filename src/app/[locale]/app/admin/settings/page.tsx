import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getOrgSettingsForAdmin } from "@/lib/dal/admin-settings";
import { saveSettings } from "./actions";
import { SettingsForm } from "./settings-form";

// SCR-063 · /app/admin/settings (REQ-TEN-008, REQ-INT-006, REQ-MAT-009).
// Admin only. `/admin/reminders` (notify) and `/admin/recognition`
// (scoring) already own their own slices of `org_settings` — this screen
// is everything REQ-TEN-008 asks for that neither of those already covers.

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [settings, t] = await Promise.all([getOrgSettingsForAdmin(locale), getTranslations("admin.settings")]);
  if (settings === null) notFound();

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <SettingsForm action={saveSettings.bind(null, locale as Locale)} settings={settings} />
    </>
  );
}
