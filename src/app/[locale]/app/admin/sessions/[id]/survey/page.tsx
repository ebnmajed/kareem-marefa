import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DetachControl } from "@/components/survey/detach-control";
import { SurveyResults } from "@/components/survey/results";
import { formatNumber } from "@/components/sessions/numerals";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import type { Locale } from "@/i18n/routing";
import { requireSession } from "@/lib/dal/session";
import { getSessionHeading } from "@/lib/dal/sessions";
import { getSurveyResults, listSurveyTemplates } from "@/lib/dal/surveys";
import { attach, detach } from "./actions";

// SCR-064 · /app/admin/sessions/[id]/survey — what the organisation learned
// (REQ-SUR-005 … 008, DEC-074, DEC-094, DEC-160).
//
// ★ ADMIN AND MODERATOR, NEVER THE PRESENTER, AND THE DATABASE IS WHAT SAYS SO.
// `survey_results()` refuses a presenter — whatever their org role, so an admin
// who presented their own session is refused too — and refuses before it even
// looks the survey up, so a presenter cannot tell an attached survey from an
// absent one. This page renders `notFound()` for anyone the function refuses;
// the hidden link is not the boundary and never was (`REQ-SUR-005`).
//
// The three states `09` names: no survey (with the action that fixes it),
// withheld (saying so and why, never an empty chart), and results.

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

  const [heading, results, templates, role, t, tErrors] = await Promise.all([
    getSessionHeading(locale, id),
    getSurveyResults(locale, id),
    listSurveyTemplates(locale),
    requireSession(locale),
    getTranslations("survey.session"),
    getTranslations("survey.errors"),
  ]);
  // A presenter, a member, another org's staff and a session that is not there
  // are one answer.
  if (!heading || !results) notFound();

  const isAdmin = role.role === "admin";

  return (
    <>
      {/* ★ wave 21 (DEC-227 §5.2, contract 4): the hub draws the breadcrumb, the session's `h1` and its status above
          the tabs, so this tab's title is a section heading and its action stays beside it. The lead's edit, as
          `event`'s custodian; nothing else in the file moved. */}
      <SectionHeader
        as="h2"
        title={t("title")}
        actions={
          // ★ A PLAIN DOWNLOAD ANCHOR, not `ButtonLink`: a Route Handler that
          // answers `text/csv` is not a route to navigate to, and `next/link`
          // would prefetch it — an audited bulk read of personal data, taken
          // because a pointer passed over the button (`REQ-ADM-017`).
          // Admin-only, because `exportSurveyCsv()` refuses a moderator
          // (`write_admin_export_audit()` asserts a fresh admin, `DEC-161`) and
          // a link that 404s is worse than none.
          results.status !== "no_survey" && isAdmin ? (
            <a
              href={`/api/admin/exports/survey/${id}`}
              download
              className="inline-flex h-11 items-center rounded-field px-5 text-label text-fg-heading underline underline-offset-4 hover:bg-[var(--btn2-bg-hover)]"
            >
              {t("export")}
            </a>
          ) : undefined
        }
      />

      {flags.attached ? (
        <p role="status" className="mt-4 text-body-sm text-fg-muted">
          {t("attached")}
        </p>
      ) : null}
      {flags.detached ? (
        <p role="status" className="mt-4 text-body-sm text-fg-muted">
          {t("detached")}
        </p>
      ) : null}
      {flags.error ? (
        <div role="alert" className="mt-4 max-w-xl">
          <Panel tone="ended">
            <p className="text-body-sm text-fg-body">{tErrors(flags.error)}</p>
          </Panel>
        </div>
      ) : null}

      {results.status === "no_survey" ? (
        <div className="mt-8 max-w-xl">
          {templates && templates.length > 0 ? (
            <section aria-labelledby="attach">
              <h2 id="attach" className="text-h3 text-fg-heading">
                {t("noneTitle")}
              </h2>
              <p className="mt-2 text-body text-fg-muted">{t("noneBody")}</p>
              <form action={attach.bind(null, locale as Locale, id)} className="mt-4 flex flex-wrap items-end gap-3">
                <Field id="templateId" label={t("attachLabel")} className="min-w-64">
                  <Select name="templateId" defaultValue={templates[0].id}>
                    {templates.map((template: { id: string; title: string }) => (
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
      ) : (
        <>
          {/* A survey attached after the session ended explains a low response
              rate before anyone has to ask (§8 case 4). */}
          {results.attachedAt && heading.startsAt && results.attachedAt > heading.startsAt ? (
            <p className="mt-4 max-w-2xl text-body-sm text-fg-muted">{t("attachedAfter")}</p>
          ) : null}

          {results.status === "withheld" ? (
            <div className="mt-8 max-w-xl">
              <Panel tone="info">
                <p className="text-label text-fg-heading">{t("withheldTitle")}</p>
                <p className="mt-1 text-body-sm text-fg-body">{t("withheldBody", { min: results.min, value: formatNumber(results.min) })}</p>
                <p className="mt-2 text-body-sm text-fg-muted">{t("withheldWhy")}</p>
              </Panel>
            </div>
          ) : (
            <SurveyResults results={results} />
          )}

          {!isAdmin ? <p className="mt-6 text-caption text-fg-muted">{t("exportAdminOnly")}</p> : null}

          {/* ★ Offered only while it can work. `survey_detach()` refuses once
              anyone has answered, so a released result — which by definition has
              at least `min` responses — gets the sentence instead of a button
              that leads to a refusal. The withheld state still offers it,
              because the response count is withheld too (`DEC-163`): the screen
              cannot tell nobody from two, and «attached the wrong template and
              detached it at once» is the case that must keep working. The
              refusal path stands for both. */}
          <div className="mt-10 border-t border-edge pt-6">
            <DetachControl
              canDetach={results.status !== "ok"}
              confirming={Boolean(flags.confirm)}
              confirmHref={`/app/admin/sessions/${id}/survey?confirm=1`}
              action={detach.bind(null, locale as Locale, id)}
              detachLabel={t("detach")}
              confirmText={t("detachConfirm")}
              blockedText={tErrors("has_responses")}
            />
          </div>
        </>
      )}
    </>
  );
}
