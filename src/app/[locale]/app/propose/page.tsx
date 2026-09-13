import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMyProposal, getNumerals, listCategories } from "@/lib/dal/proposals";
import { submitProposal } from "./actions";
import { ProposalForm } from "./proposal-form";

// SCR-017 · /app/propose — propose a topic (REQ-PRO-001, REQ-PRO-002).
//
// The page is dynamic because the DAL reads cookies (no `export const
// dynamic`, per DEC-013 and the Next 16 notes in CLAUDE.md).
//
// After a successful submit the action redirects back here with ?created=,
// and the confirmation is rendered from the row itself rather than from the
// query string: the id is the only thing that crosses the URL, so a
// hand-edited link cannot make the page congratulate someone on a proposal
// that is not theirs — getMyProposal() scopes to the session's own member.

export default async function ProposePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { created } = await searchParams;

  const [categories, numerals, t] = await Promise.all([listCategories(locale), getNumerals(locale), getTranslations("proposals.propose")]);
  const proposal = created ? await getMyProposal(locale, created) : null;

  if (proposal) {
    const submitted = proposal.state !== "draft";
    return (
      <>
        <div role="status" className="max-w-2xl rounded-field border border-edge bg-silver-100 p-6">
          <h1 className="text-h2 text-fg-heading">{submitted ? t("created.submittedTitle") : t("created.draftTitle")}</h1>
          <p className="mt-3 text-body text-fg-body">
            {t.rich(submitted ? "created.submittedBody" : "created.draftBody", {
              title: proposal.title,
              t: (chunks) => <bdi>{chunks}</bdi>,
            })}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-fg-muted">
            {proposal.categoryName ? (
              <div className="flex gap-2">
                <dt>{t("form.categoryLabel")}</dt>
                <dd>
                  <bdi>{proposal.categoryName}</bdi>
                </dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt>{t("form.levelLabel")}</dt>
              <dd>{t(`form.level${proposal.level === "introductory" ? "Introductory" : proposal.level === "intermediate" ? "Intermediate" : "Advanced"}`)}</dd>
            </div>
            {proposal.expectedDurationMinutes !== null ? (
              <div className="flex gap-2">
                <dt>{t("form.durationLabel")}</dt>
                <dd>
                  <bdi>
                    {t("duration", {
                      count: proposal.expectedDurationMinutes,
                      value: formatNumber(proposal.expectedDurationMinutes, numerals),
                    })}
                  </bdi>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <p className="mt-6">
          <Link href="/app/propose" className="text-label text-fg-heading underline underline-offset-4">
            {t("created.another")}
          </Link>
        </p>
      </>
    );
  }

  const action = submitProposal.bind(null, locale as Locale);
  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body-lg text-fg-heading">{t("lead")}</p>
      <p className="mt-2 max-w-2xl text-body text-fg-muted">{t("leadBody")}</p>
      {/* REQ-PRO-001, said to the member and not only to the schema. */}
      <p className="mt-4 max-w-2xl rounded-field border border-edge bg-silver-100 p-4 text-body-sm text-fg-body">{t("noScheduleNote")}</p>
      <ProposalForm action={action} categories={categories} />
    </>
  );
}
