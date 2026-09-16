import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { listCompaniesForAdmin } from "@/lib/dal/admin-lists";
import { addCompany, toggleCompany } from "./actions";
import { CompanyForm } from "./company-form";

// SCR-048 · /app/admin/companies (REQ-ADM-008, REQ-PRF-002). Same shape as
// `admin/categories/page.tsx` and the inherited `admin/venues/page.tsx`: no
// delete button, and that is a privilege fact (`companies` has no delete
// grant and no delete policy, 0004), not a UI decision.

export default async function CompaniesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [companies, t] = await Promise.all([listCompaniesForAdmin(locale), getTranslations("admin.companies")]);
  if (companies === null) notFound();

  const num = (n: number) => formatNumber(n);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("noDeleteNote")}</p>

      <section aria-labelledby="add" className="mt-10 max-w-md">
        <h2 id="add" className="text-h2 text-fg-heading">
          {t("addTitle")}
        </h2>
        <CompanyForm action={addCompany.bind(null, locale as Locale)} />
      </section>

      <section aria-labelledby="list" className="mt-12 max-w-2xl border-t border-edge pt-8">
        <h2 id="list" className="text-h2 text-fg-heading">
          {t("listTitle")}
        </h2>
        {companies.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {companies.map((c) => {
              const active = c.deactivatedAt === null;
              return (
                <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-field border border-edge p-4">
                  <div className="min-w-0">
                    <p className="text-label text-fg-heading">
                      <bdi>{c.name}</bdi>
                      {!active ? <span className="ms-2 text-body-sm font-normal text-fg-muted">{t("deactivated")}</span> : null}
                    </p>
                    <p className="mt-1 text-body-sm text-fg-muted">{t("memberCount", { count: c.memberCount, value: num(c.memberCount) })}</p>
                  </div>
                  <form action={toggleCompany.bind(null, locale as Locale, c.id, !active)} className="ms-auto">
                    <button type="submit" className="inline-flex h-11 items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading hover:bg-silver-100">
                      {active ? t("deactivate") : t("activate")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
