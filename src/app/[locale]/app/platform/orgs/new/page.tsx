import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/dal/platform";
import { createOrgAction } from "../actions";
import { NewOrgForm } from "./org-form";

// SCR-081 · /app/platform/orgs/new — REQ-TEN-002, REQ-TEN-004, onto the system
// for wave 8 (`docs/plan/notes/platform.md` W8.4).
//
// The gate is called here, at the data, and not only in the layout: Partial
// Rendering does not re-render a layout on navigation [v16], so a page that
// relies on its layout's check is a page with no check.
export default async function NewOrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin(locale);
  const [t, tOrgs] = await Promise.all([getTranslations("platform.newOrg"), getTranslations("platform.orgs")]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("intro")}
        breadcrumb={[{ href: "/app/platform/orgs", label: tOrgs("title") }]}
        breadcrumbLabel={t("breadcrumb")}
      />
      <div className="mt-8">
        <NewOrgForm action={createOrgAction.bind(null, locale as Locale)} />
      </div>
    </>
  );
}
