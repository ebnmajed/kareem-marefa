import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TemplateQuestionsTable, TemplatesTable } from "@/components/survey/templates-table";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Locale } from "@/i18n/routing";
import { getSurveyTemplate, listSurveyTemplates } from "@/lib/dal/surveys";
import { deleteFromList } from "./actions";

// SCR-065 · /app/admin/surveys — the question sets an org reuses, rebuilt in wave 22 from `AdminSurveys.dc.html`
// (REQ-UIX-106, REQ-SUR-001, REQ-SUR-002, DEC-160, DEC-232). Deleted first, then written (`DEC-208`); the
// kept-behaviour table is `docs/plan/notes/event.md` § Wave 22 §3.2.
//
// The `h1` and its one primary, «قالب جديد»; then the templates — name, questions, sessions — with the selected one's
// questions BESIDE them (`REQ-UIX-106`, `DEC-232`), read on the server from `?template=<id>`, the first by default.
// The artboard's «افتراضي» has no column and is absent (`DEC-232`).
//
// ★ STAFF — ADMIN AND MODERATOR — AND THE DATABASE SAYS SO. The six authoring tables carry a `select` policy for
// `is_staff()` and no write policy at all; `listSurveyTemplates()` answers `null` for a member and the page answers
// `notFound()`. A moderator authors templates (`REQ-ADM-020`).
//
// ★ «الجلسات» counts the COPIES made: attaching copies a template into a session's survey, so editing it afterwards
// changes none of them. The editor (`[templateId]`, kept untouched) is where questions are written and reordered by
// taps alone (`ui/reorderable-list`, `REQ-SUR-002`).
//
// ★ Every write is recorded by the database — `survey_template.created` · `changed` · `deleted` from the lead's trigger
// on `survey_templates` (`DEC-231` §4); nothing here or in the DAL writes `audit_log`.

export default async function SurveyTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ template?: string; delete?: string; deleted?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const flags = await searchParams;

  const [templates, t, tErrors] = await Promise.all([
    listSurveyTemplates(locale),
    getTranslations("survey.templates"),
    getTranslations("survey.errors"),
  ]);
  if (templates === null) notFound();

  const selectedId = templates.find((row) => row.id === flags.template)?.id ?? templates[0]?.id ?? null;
  const selected = selectedId ? await getSurveyTemplate(locale, selectedId) : null;
  const deleting = templates.find((row) => row.id === flags.delete) ?? null;

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ButtonLink href="/app/admin/surveys/new" size="md">
            {t("new")}
          </ButtonLink>
        }
      />

      {flags.deleted ? (
        <p role="status" className="mt-4 text-body-sm text-fg-muted">
          {t("deleted")}
        </p>
      ) : null}
      {flags.error ? (
        <div role="alert" className="mt-4 max-w-xl">
          <Panel tone="ended">
            <p className="text-body-sm text-fg-body">{tErrors("generic")}</p>
          </Panel>
        </div>
      ) : null}

      {deleting ? (
        // The second step of «احذف القالب», server-side: asked in words, completed by a form, survives a reload.
        <section aria-labelledby="delete-template" className="mt-6 max-w-xl">
          <Panel tone="ended">
            <h2 id="delete-template" className="text-label text-fg-heading">
              <bdi>{deleting.title}</bdi>
            </h2>
            <p className="mt-1 text-body-sm text-fg-body">{t("deleteConfirm")}</p>
            <form action={deleteFromList.bind(null, locale as Locale, deleting.id)} className="mt-4 flex flex-wrap items-center gap-3">
              <SubmitButton variant="danger" size="md">
                {t("delete")}
              </SubmitButton>
              <ButtonLink href={`/app/admin/surveys?template=${deleting.id}`} variant="secondary" size="md">
                {t("cancel")}
              </ButtonLink>
            </form>
          </Panel>
        </section>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TemplatesTable rows={templates} selectedId={selectedId} />

        {selected ? (
          <section aria-labelledby="template-questions">
            <h2 id="template-questions" className="mb-3 text-label text-fg-muted">
              <bdi>{selected.title}</bdi>
            </h2>
            <TemplateQuestionsTable
              templateId={selected.id}
              title={selected.title}
              rows={selected.questions.map((q) => ({ id: q.id, prompt: q.prompt, kind: q.kind, required: q.required }))}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
