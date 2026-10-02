import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorSurface } from "@/components/admin/editor-surface";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { listCompaniesForAdmin } from "@/lib/dal/admin-lists";
import { getCompanyCup } from "@/lib/dal/leaderboards";
import { saveCompany } from "./actions";
import { CompaniesTable } from "./companies-table";
import { CompanyForm } from "./company-form";

// SCR-048 · /app/admin/companies (`REQ-ADM-008`, `REQ-UIX-095`, `REQ-UIX-043`), written for wave 22 from
// `AdminCompanies.dc.html` (`DEC-208`: deleted first). The job: an admin reads each company's colour, members and the
// quarter's points, and adds, renames, recolours or retires one from its row.
//
// Admin only, decided at the data (`listCompaniesForAdmin` → null → the streamed not-found, `DEC-134`). The quarter's
// points are read from the quarter's company snapshot (`getCompanyCup()`, `scoring`'s, read only) — never a literal.
// «شركة جديدة» and «عدّل» are LINKS — `?new=1`, `?edit=<id>` — the form a region without JS and the sheet with it.

const PATH = "/app/admin/companies";

export default async function CompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [companies, t] = await Promise.all([listCompaniesForAdmin(locale), getTranslations("admin.companies")]);
  if (companies === null) notFound();
  const cup = await getCompanyCup(locale);
  const quarter = new Map((cup?.rows ?? []).map((r) => [r.companyId, r.totalPoints]));
  const rows = companies.map((c) => ({ ...c, quarterPoints: quarter.get(c.id) ?? null }));

  const editing = typeof sp.edit === "string" ? (companies.find((c) => c.id === sp.edit) ?? null) : null;
  const creating = !editing && sp.new === "1";

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href={`${PATH}?new=1#company-editor`} size="md">
            {t("newCompany")}
          </ButtonLink>
        }
      />

      {creating || editing ? (
        <EditorSurface key={editing?.id ?? "new"} id="company-editor" title={editing ? t("editTitle") : t("newCompany")} closeHref={PATH} closeLabel={t("closeEditor")}>
          <CompanyForm action={saveCompany.bind(null, locale as Locale, editing?.id ?? null)} company={editing} closeHref={PATH} />
        </EditorSurface>
      ) : null}

      <div className="mt-6">
        <CompaniesTable companies={rows} locale={locale as Locale} />
      </div>
    </>
  );
}
