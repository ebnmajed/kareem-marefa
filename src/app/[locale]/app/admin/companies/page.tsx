import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listCompaniesForAdmin } from "@/lib/dal/admin-lists";
import { addCompany } from "./actions";
import { CompaniesTable } from "./companies-table";
import { CompanyForm } from "./company-form";

// SCR-048 · /app/admin/companies (REQ-ADM-008, REQ-PRF-002), rebuilt onto
// the system for wave 7 (`16` §6.7, `DEC-137`). Same shape as
// `admin/categories/page.tsx` and the inherited `admin/venues/page.tsx`: no
// delete button, and that is a privilege fact (`companies` has no delete
// grant and no delete policy, 0004), not a UI decision.

export default async function CompaniesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [companies, t] = await Promise.all([listCompaniesForAdmin(locale), getTranslations("admin.companies")]);
  if (companies === null) notFound();

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("noDeleteNote")}</p>

      <section aria-labelledby="add" className="mt-10 max-w-md">
        <SectionHeader as="h2" id="add" title={t("addTitle")} />
        <CompanyForm action={addCompany.bind(null, locale as Locale)} />
      </section>

      <section aria-labelledby="list" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="list" title={t("listTitle")} />
        <div className="mt-4">
          <CompaniesTable companies={companies} locale={locale as Locale} />
        </div>
      </section>
    </>
  );
}
