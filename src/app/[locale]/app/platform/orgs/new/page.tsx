import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { requirePlatformAdmin } from "@/lib/dal/platform";
import { createOrgAction } from "../actions";
import { NewOrgForm } from "./org-form";

// SCR-081 · /app/platform/orgs/new — REQ-TEN-002, REQ-TEN-004, REQ-TEN-007, REQ-UIX-118. Written for wave 26 from
// `PlatformOrgNew.dc.html` (`DEC-208`: deleted first); what it kept is `docs/plan/notes/platform.md` W26.2.2.
//
// The page has no read, so it gates here, at the page (F2): a layout is not re-rendered on navigation [v16], and a
// page that relies on its layout's check is a page with no check. Its `h1` row carries no primary — the form's own
// «أنشئ» is the one action, at the form's end as drawn.

export default async function NewOrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin(locale);
  const t = await getTranslations("platform.newOrg");

  return (
    <>
      <PageHeader inlineActions title={t("title")} />
      <div className="mt-6">
        <NewOrgForm action={createOrgAction.bind(null, locale as Locale)} />
      </div>
    </>
  );
}
