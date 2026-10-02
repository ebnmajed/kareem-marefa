import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DetachControl } from "@/components/survey/detach-control";
import { SurveyResults } from "@/components/survey/results";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Locale } from "@/i18n/routing";
import { getPresenterAggregate, getRatingCount } from "@/lib/dal/ratings";
import { getSurveyResultsOrNull, listSurveyTemplates } from "@/lib/dal/surveys";
import { attach, detach } from "./actions";

// SCR-064 · /app/admin/sessions/[id]/survey — the hub's الاستبانة tab, rebuilt in wave 22 from
// `AdminSurveyResults.dc.html` (REQ-UIX-105, REQ-SUR-005 … 008, DEC-074, DEC-160, DEC-232). Deleted first, then
// written (`DEC-208`); the kept-behaviour table is `docs/plan/notes/event.md` § Wave 22 §3.1.
//
// ★ THE HUB DRAWS THE HEADER. The breadcrumb, the `h1`, the status, the strip and this tab's «CSV»
// (`SurveyHeaderAction`, under the layout's `survey` key) are the layout's; this page renders none of it.
//
// ★ ADMIN AND MODERATOR, NEVER THE PRESENTER, AND THE DATABASE SAYS SO. `survey_results()` refuses the session's
// presenter — an admin who presented included — before it looks the survey up, so a presenter cannot tell an attached
// survey from an absent one. Every refusal is one `notFound()` (`getSurveyResultsOrNull`): until wave 22 the two
// refusals rendered the error boundary, which the comment here promised they did not.
//
// ★ NOTHING WRITES ON A READ. The rating's averages come from the aggregates view, so this page leaves no
// `ratings.read_admin` row (`DEC-232` §2.7); attach and detach write `survey.attached` / `survey.detached` in SQL; the
// CSV's `export.created` is written by its download.
//
// The three states: no survey (the action that fixes it, and nothing of the rating — as before, `DEC-232`), withheld
// (saying so and why, never an empty chart), and results.

export default async function SessionSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ attached?: string; detached?: string; error?: string; confirm?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const flags = await searchParams;

  const [results, t, tErrors] = await Promise.all([
    getSurveyResultsOrNull(locale, id),
    getTranslations("survey.session"),
    getTranslations("survey.errors"),
  ]);
  // A presenter, a member, another org's staff and a session that is not there are one answer.
  if (!results) notFound();

  const notices = (
    <>
      {flags.attached ? (
        <p role="status" className="mb-4 text-body-sm text-fg-muted">
          {t("attached")}
        </p>
      ) : null}
      {flags.detached ? (
        <p role="status" className="mb-4 text-body-sm text-fg-muted">
          {t("detached")}
        </p>
      ) : null}
      {flags.error ? (
        <div role="alert" className="mb-4 max-w-xl">
          <Panel tone="ended">
            <p className="text-body-sm text-fg-body">{tErrors(flags.error)}</p>
          </Panel>
        </div>
      ) : null}
    </>
  );

  if (results.status === "no_survey") {
    const templates = await listSurveyTemplates(locale);
    return (
      <div className="max-w-xl">
        {notices}
        {templates && templates.length > 0 ? (
          <section aria-labelledby="attach">
            <h2 id="attach" className="text-h3 text-fg-heading">
              {t("noneTitle")}
            </h2>
            <form action={attach.bind(null, locale as Locale, id)} className="mt-4 flex flex-wrap items-end gap-3">
              <Field id="templateId" label={t("attachLabel")} className="min-w-64">
                <Select name="templateId" defaultValue={templates[0].id}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton>{t("attachSubmit")}</SubmitButton>
            </form>
          </section>
        ) : (
          <EmptyState title={t("noneTitle")} description={t("noTemplates")} action={{ label: t("attach"), href: "/app/admin/surveys/new" }} />
        )}
      </div>
    );
  }

  const [rating, ratingCount] = await Promise.all([getPresenterAggregate(locale, id), getRatingCount(locale, id)]);

  return (
    <>
      {notices}
      <SurveyResults results={results} rating={rating} ratingCount={ratingCount} />

      {results.status === "withheld" ? (
        // Never an empty chart: withheld, and why (`REQ-SUR-006`'s acceptance).
        <div className="mt-4 max-w-xl">
          <Panel tone="info">
            <p className="text-label text-fg-heading">{t("withheldTitle")}</p>
            <p className="mt-1 text-body-sm text-fg-body">{t("withheldBody", { min: results.min, value: formatNumber(results.min) })}</p>
            <p className="mt-2 text-body-sm text-fg-muted">{t("withheldWhy")}</p>
          </Panel>
        </div>
      ) : null}

      {/* ★ Offered only while it can work: `survey_detach()` refuses once anyone has answered, and a released result
          has at least `min` responses — so a released result shows NO detach and no sentence about one (DEC-NEXT-25:
          nothing is shown when nothing can be done). The withheld state still offers it, because its count is withheld
          too. A press that races an answer still lands on `?error=has_responses`, the alert above. */}
      {results.status !== "ok" ? (
        <div className="mt-8 border-t border-edge pt-6">
          <DetachControl
            canDetach
            confirming={Boolean(flags.confirm)}
            confirmHref={`/app/admin/sessions/${id}/survey?confirm=1`}
            action={detach.bind(null, locale as Locale, id)}
            detachLabel={t("detach")}
            confirmText={t("detachConfirm")}
            blockedText={tErrors("has_responses")}
          />
        </div>
      ) : null}
    </>
  );
}
