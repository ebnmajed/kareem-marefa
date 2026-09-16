import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { listCategoriesForAdmin } from "@/lib/dal/admin-lists";
import { addCategory } from "./actions";
import { CategoriesTable } from "./categories-table";
import { CategoryForm } from "./category-form";

// SCR-047 · /app/admin/categories (REQ-ADM-007, REQ-DSC-001, REQ-DSC-002,
// REQ-DSC-004), rebuilt onto the system for wave 7 (`16` §6.7, `DEC-137`).
// Same shape as the inherited `admin/venues/page.tsx`: no delete button, and
// that is a privilege fact (`categories` has no delete grant and no delete
// policy, 0004), not a UI decision.

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [categories, t] = await Promise.all([listCategoriesForAdmin(locale), getTranslations("admin.categories")]);
  if (categories === null) notFound();

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">{t("noDeleteNote")}</p>

      <section aria-labelledby="add" className="mt-10 max-w-md">
        <SectionHeader as="h2" id="add" title={t("addTitle")} />
        <CategoryForm action={addCategory.bind(null, locale as Locale)} />
      </section>

      <section aria-labelledby="list" className="mt-12 border-t border-edge pt-8">
        <SectionHeader as="h2" id="list" title={t("listTitle")} />
        <div className="mt-4">
          <CategoriesTable categories={categories} locale={locale as Locale} />
        </div>
      </section>
    </>
  );
}
