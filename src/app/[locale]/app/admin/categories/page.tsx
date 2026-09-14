import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { listCategoriesForAdmin } from "@/lib/dal/admin-lists";
import { addCategory, toggleCategory } from "./actions";
import { CategoryForm } from "./category-form";

// SCR-047 · /app/admin/categories (REQ-ADM-007, REQ-DSC-001, REQ-DSC-002,
// REQ-DSC-004). Same shape as the inherited `admin/venues/page.tsx`: no
// delete button, and that is a privilege fact (`categories` has no delete
// grant and no delete policy, 0004), not a UI decision.

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, prefs, t] = await Promise.all([listCategoriesForAdmin(locale), getOrgPrefs(locale), getTranslations("admin.categories")]);
  if (categories === null) notFound();

  const num = (n: number) => formatNumber(n, prefs.numerals);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>
      <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("noDeleteNote")}</p>

      <section aria-labelledby="add" className="mt-10 max-w-md">
        <h2 id="add" className="text-h2 text-fg-heading">
          {t("addTitle")}
        </h2>
        <CategoryForm action={addCategory.bind(null, locale as Locale)} />
      </section>

      <section aria-labelledby="list" className="mt-12 max-w-2xl border-t border-edge pt-8">
        <h2 id="list" className="text-h2 text-fg-heading">
          {t("listTitle")}
        </h2>
        {categories.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("empty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {categories.map((c) => {
              const active = c.deactivatedAt === null;
              return (
                <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-field border border-edge p-4">
                  <div className="min-w-0">
                    <p className="text-label text-fg-heading">
                      <bdi>{c.name}</bdi>
                      {!active ? <span className="ms-2 text-body-sm font-normal text-fg-muted">{t("deactivated")}</span> : null}
                    </p>
                    <p className="mt-1 text-body-sm text-fg-muted">{t("sessionCount", { count: c.sessionCount, value: num(c.sessionCount) })}</p>
                  </div>
                  <form action={toggleCategory.bind(null, locale as Locale, c.id, !active)} className="ms-auto">
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
