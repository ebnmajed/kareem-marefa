import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { listSurveyTemplates } from "@/lib/dal/surveys";

// SCR-065 · /app/admin/surveys — the question sets an org reuses
// (REQ-SUR-001, REQ-SUR-002, DEC-160).
//
// Staff only, and that is the database's word rather than this page's: the six
// authoring tables carry a `select` policy for `is_staff()` and no write policy
// at all, so a member reaching this URL is handed `notFound()` by the guard in
// `lib/dal/surveys.ts` and would see an empty list even without it.
//
// A template is COPIED into a session's survey when it is attached (SCR-064),
// so «كم جلسة تستخدمه» counts copies already made and editing the template
// afterwards changes none of them — which is the sentence the list has to make
// visible, because it is the difference between this screen and one that edits
// what members are already answering.

export default async function SurveyTemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [templates, prefs, t] = await Promise.all([listSurveyTemplates(locale), getOrgPrefs(locale), getTranslations("survey.templates")]);
  if (templates === null) notFound();

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <ButtonLink href="/app/admin/surveys/new" size="md">
            {t("new")}
          </ButtonLink>
        }
      />

      {templates.length === 0 ? (
        <div className="mt-10 max-w-xl">
          <EmptyState title={t("emptyTitle")} description={t("emptyBody")} action={{ label: t("new"), href: "/app/admin/surveys/new" }} />
        </div>
      ) : (
        <ul className="mt-8 flex max-w-2xl flex-col gap-3">
          {templates.map((template) => (
            <li key={template.id}>
              <Card href={`/app/admin/surveys/${template.id}`}>
                <h2 className="text-label text-fg-heading">
                  <bdi>{template.title}</bdi>
                </h2>
                <p className="mt-1 text-body-sm text-fg-muted">
                  {t("questionCount", { count: template.questionCount, value: formatNumber(template.questionCount) })}
                  {" · "}
                  {t("sessionCount", { count: template.sessionCount, value: formatNumber(template.sessionCount) })}
                </p>
                <p className="mt-1 text-caption text-fg-muted">{t("updatedAt", { date: formatDate(template.updatedAt, prefs.timeZone, locale) })}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
