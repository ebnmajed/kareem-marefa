import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/routing";
import { getSurveyTemplate } from "@/lib/dal/surveys";
import { TemplateEditor } from "./template-editor";

// SCR-065's editor · /app/admin/surveys/[templateId] (REQ-SUR-001, REQ-SUR-002).
//
// `new` is the id of a template that does not exist yet, which is why `04` §4
// carries two survey routes and not three: the editor is the same screen either
// way, and the save decides between an insert and a whole-set replace.
//
// ★ This page reads and hands over PLAIN DATA. The editor is a client island
// because `ui/reorderable-list` takes function props (DEC-159), and a Server
// Component that passed it `renderItem` would crash — only in a production
// build, which is the kind of failure that reaches the owner's demonstrable and
// not the test suite.

export default async function SurveyTemplatePage({ params }: { params: Promise<{ locale: string; templateId: string }> }) {
  const { locale, templateId } = await params;
  setRequestLocale(locale);

  const isNew = templateId === "new";
  const [template, t, tUi] = await Promise.all([
    isNew ? Promise.resolve(null) : getSurveyTemplate(locale, templateId),
    getTranslations("survey"),
    getTranslations("ui.pageHeader"),
  ]);
  // A template of another org, one that is gone, and a member who may not read
  // templates at all are one answer: there is nothing here.
  if (!isNew && !template) notFound();

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/app/admin/surveys", label: t("templates.title") }]}
        breadcrumbLabel={tUi("breadcrumb")}
        title={template ? template.title : t("editor.newTitle")}
      />
      <TemplateEditor locale={locale as Locale} template={template} />
    </>
  );
}
