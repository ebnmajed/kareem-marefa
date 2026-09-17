import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/stat";
import type { SurveyResultQuestion, SurveyResultsDTO } from "@/lib/dal/surveys";

// SCR-064's results, drawn (REQ-SUR-006, REQ-SUR-008, `16` §9.2).
//
// ★ NOTHING HERE DECIDES WHAT MAY BE SHOWN. `public.survey_results()` applies
// the withhold — to the survey, to each question, and to the response count —
// and hands back `withheld: true` and nulls where it did. This renders what it
// was given, which is why the screen and the CSV cannot drift apart: they are
// two shapes of one answer.
//
// ★ BARS GROW FROM THE START EDGE and every bar carries its own number, so a
// distribution is readable without a legend and without colour (`09` SCR-064).
// `ui/progress` is the house bar and is already logical-property-only; the
// numbers are formatted here, in Western digits (DEC-124).

/**
 * The keys this file reads from `survey.session`, as a function type — the
 * `DayLabelT` idiom (`components/sessions/day-label.ts`). ★ It exists so only
 * the TOP of this file is async: a nested async component cannot be rendered by
 * anything but a Server Component, which makes it untestable in jsdom and
 * unreviewable anywhere else.
 */
type ResultsT = (key: string, values?: Record<string, string | number>) => string;

export async function SurveyResults({ results }: { results: SurveyResultsDTO }) {
  const t = (await getTranslations("survey.session")) as ResultsT;

  return (
    <>
      <section aria-labelledby="rate" className="mt-8">
        <h2 id="rate" className="text-h3 text-fg-heading">
          {t("responseRate")}
        </h2>
        <div className="mt-3 max-w-md">
          {results.eligibleCount === 0 ? (
            <p className="text-body text-fg-muted">{t("noAttendees")}</p>
          ) : (
            <Stat
              label={t("responseRate")}
              value={`${formatNumber(results.responseCount ?? 0)} / ${formatNumber(results.eligibleCount)}`}
              hint={t("outOfEligible", { count: results.eligibleCount, value: formatNumber(results.eligibleCount) })}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="questions" className="mt-10">
        <h2 id="questions" className="text-h3 text-fg-heading">
          {t("title")}
        </h2>
        <ul className="mt-4 flex max-w-2xl flex-col gap-6">
          {results.questions.map((question) => (
            <li key={question.id}>
              <QuestionResult question={question} t={t} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function QuestionResult({ question, t }: { question: SurveyResultQuestion; t: ResultsT }) {
  const total = Math.max(1, ...(question.distribution ?? []).map((cell) => cell.count));

  return (
    <article aria-labelledby={`q-${question.id}`}>
      <h3 id={`q-${question.id}`} className="text-label text-fg-heading">
        <bdi>{question.prompt}</bdi>
      </h3>
      {/* ★ A withheld question publishes NO count either (`DEC-163`): two reads
          a response apart would otherwise say which question the newest
          respondent answered. «محجوبة» below is the whole of what staff get. */}
      {question.answeredCount !== null ? (
        <p className="mt-1 text-caption text-fg-muted">
          {t("answeredCount", { count: question.answeredCount, value: formatNumber(question.answeredCount) })}
          {question.mean !== null ? ` · ${t("mean", { value: formatNumber(question.mean) })}` : null}
        </p>
      ) : null}

      {question.withheld ? (
        // Never an empty chart: the screen says results are withheld and why
        // (REQ-SUR-006's acceptance).
        <Panel tone="info" className="mt-2">
          <p className="text-body-sm text-fg-body">{t("questionWithheld")}</p>
        </Panel>
      ) : question.texts ? (
        <ul className="mt-2 flex flex-col gap-2">
          {question.texts.map((text, index) => (
            <li key={index} className="rounded-card bg-silver-100 p-3 text-body text-fg-body">
              <bdi>{text}</bdi>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {(question.distribution ?? []).map((cell) => (
            <li key={cell.id ?? cell.value}>
              <Progress
                value={cell.count}
                max={total}
                label={cell.label ?? formatNumber(cell.value ?? 0)}
                valueText={formatNumber(cell.count)}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
