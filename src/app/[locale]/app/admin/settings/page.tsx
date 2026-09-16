import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { getOrgSettingsForAdmin } from "@/lib/dal/admin-settings";
import { saveSettings } from "./actions";
import { SavedToast } from "./saved-toast";
import { SettingsForm } from "./settings-form";

// SCR-063 · /app/admin/settings (REQ-TEN-008, REQ-INT-006, REQ-MAT-009),
// rebuilt onto the system for wave 7 (`16` §6.7, `DEC-137`). Admin only.
// `/admin/reminders` (notify) and `/admin/recognition` (scoring) already own
// their own slices of `org_settings` — this screen is everything
// REQ-TEN-008 asks for that neither of those already covers.

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [settings, t, sp] = await Promise.all([getOrgSettingsForAdmin(locale), getTranslations("admin.settings"), searchParams]);
  if (settings === null) notFound();

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      {sp.saved === "1" ? <SavedToast message={t("saved")} /> : null}
      <SettingsForm action={saveSettings.bind(null, locale as Locale)} settings={settings} />
    </>
  );
}
