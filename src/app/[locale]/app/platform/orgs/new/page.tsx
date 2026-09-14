import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/dal/platform";
import { createOrgAction } from "../actions";
import { NewOrgForm } from "./org-form";

// SCR-081 · /app/platform/orgs/new — REQ-TEN-002, REQ-TEN-004.
//
// The gate is called here, at the data, and not only in the layout: Partial
// Rendering does not re-render a layout on navigation [v16], so a page that
// relies on its layout's check is a page with no check.
export default async function NewOrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin(locale);
  const t = await getTranslations("platform.newOrg");

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <NewOrgForm action={createOrgAction.bind(null, locale as Locale)} />
    </>
  );
}
