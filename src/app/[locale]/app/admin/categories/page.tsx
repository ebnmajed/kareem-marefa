import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EditorSurface } from "@/components/admin/editor-surface";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { listCategoriesForAdmin } from "@/lib/dal/admin-lists";
import { saveCategory } from "./actions";
import { CategoriesTable } from "./categories-table";
import { CategoryForm } from "./category-form";

// SCR-047 · /app/admin/categories (`REQ-ADM-007`, `REQ-UIX-094`), written for wave 22 from `AdminCategories.dc.html`
// (`DEC-208`: deleted first). Categories alone — no tags, and no label says «والوسوم» (`DEC-227` §3). The job: an
// admin adds or renames a category, sees how much uses it, and retires one by deactivating it.
//
// Admin only, decided at the data (`listCategoriesForAdmin` → null → the streamed not-found, `DEC-134`). «تصنيف جديد»
// and «عدّل» are LINKS — `?new=1`, `?edit=<id>` — so the form works without JS; with JS it is the sheet (`DEC-232`
// §5.5). No delete exists: there is no delete grant and no delete policy (0004).

const PATH = "/app/admin/categories";

export default async function CategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [categories, t] = await Promise.all([listCategoriesForAdmin(locale), getTranslations("admin.categories")]);
  if (categories === null) notFound();

  const editing = typeof sp.edit === "string" ? (categories.find((c) => c.id === sp.edit) ?? null) : null;
  const creating = !editing && sp.new === "1";

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href={`${PATH}?new=1#category-editor`} size="md">
            {t("newCategory")}
          </ButtonLink>
        }
      />

      {creating || editing ? (
        <EditorSurface key={editing?.id ?? "new"} id="category-editor" title={editing ? t("editTitle") : t("newCategory")} closeHref={PATH} closeLabel={t("closeEditor")}>
          <CategoryForm action={saveCategory.bind(null, locale as Locale, editing?.id ?? null)} category={editing} closeHref={PATH} />
        </EditorSurface>
      ) : null}

      <div className="mt-6">
        <CategoriesTable categories={categories} locale={locale as Locale} />
      </div>
    </>
  );
}
