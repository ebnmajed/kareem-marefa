import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/stat";
import type { PresenterAggregate } from "@/lib/dal/ratings";
import type { SurveyResultQuestion, SurveyResultsDTO } from "@/lib/dal/surveys";

// SCR-064's body, written from `AdminSurveyResults.dc.html` (REQ-UIX-105, REQ-SUR-006 … 008, DEC-232 §1.4) — the
// figures, then one card per question in the survey's order. The hub draws everything above it.
//
// ★ TWO INSTRUMENTS, AND EACH FIGURE SAYS WHICH (`DEC-074`, `DEC-232` §1.4). The responses and their rate are the
// SURVEY's, from `survey_results()`; the two averages are the RATING's, from `session_rating_aggregates` — the view
// both staff roles read, aggregate only, which writes no record (`REQ-RAT-005`'s audit is the per-rater read, and
// this page makes none). The stars drawn as bars are the survey's own 1–5 questions — the owner's ruling.
//
// ★ NOTHING HERE DECIDES WHAT MAY BE SHOWN. `survey_results()` withholds — the survey, each question, the count —
// and the view withholds the rating below its own minimum. A withheld figure is «—», never `0`, which would be a
// number the withhold did not release; a withheld question says so and draws no chart (`REQ-SUR-006`).
//
// ★★ EVERY BAR CARRIES ITS LABEL AND ITS COUNT AS VISIBLE TEXT (wave 10's lesson): `ui/progress` is a bare bar, so a
// row that named itself only through `aria-label` drew unlabelled lines. Bars grow from the start edge; no fixed
// width, no `overflow: hidden` on a text line, nothing physical. Western digits (DEC-124).

/** The keys this file reads from `survey.session`, as a function type — so only the top of the file is async and a
 *  component test can render the rest. */
type ResultsT = (key: string, values?: Record<string, string | number>) => string;

export interface SurveyResultsProps {
  results: SurveyResultsDTO;
  /** The rating's aggregate, `null` below `rating_min_aggregate`. */
  rating: PresenterAggregate | null;
  /** The rating's bare count — shown beside a withheld average, never a value. */
  ratingCount: number;
}

export async function SurveyResults({ results, rating, ratingCount }: SurveyResultsProps) {
  const t = (await getTranslations("survey.session")) as ResultsT;
  const none = t("figureNone");
  const released = results.status === "ok" && results.responseCount !== null;
  const rate =
    released && results.eligibleCount > 0 ? `${formatNumber(Math.round(((results.responseCount ?? 0) / results.eligibleCount) * 100))}%` : none;
  const average = (value: number | null) => (rating && value !== null ? formatNumber(Number(value)) : none);
  // Below the rating's minimum the averages are «—» and the bare count says why there is no value (`REQ-RAT-006`).
  const ratingHint = rating ? undefined : t("ratingCount", { count: ratingCount, value: formatNumber(ratingCount) });

  return (
    <>
      <section aria-labelledby="survey-figures">
        <h2 id="survey-figures" className="sr-only">
          {t("figuresLabel")}
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label={t("figureResponses")}
            value={released ? `${formatNumber(results.responseCount ?? 0)} / ${formatNumber(results.eligibleCount)}` : none}
            // REQ-SUR-008: no eligible attendee is said, never divided by.
            hint={results.eligibleCount === 0 ? t("noAttendees") : undefined}
          />
          <Stat label={t("figureSessionAvg")} value={average(rating?.sessionAvg ?? null)} hint={ratingHint} />
          <Stat label={t("figurePresenterAvg")} value={average(rating?.presenterAvg ?? null)} hint={ratingHint} />
          <Stat label={t("figureRate")} value={rate} />
        </div>
      </section>

      {results.status === "ok" ? (
        <section aria-labelledby="survey-questions" className="mt-4">
          <h2 id="survey-questions" className="sr-only">
            {t("title")}
          </h2>
          <ul className="flex flex-col gap-4">
            {results.questions.map((question) => (
              <li key={question.id}>
                <QuestionResult question={question} t={t} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-fg-muted">{t("anonymity", { min: results.min, value: formatNumber(results.min) })}</p>
        </section>
      ) : null}
    </>
  );
}

export function QuestionResult({ question, t }: { question: SurveyResultQuestion; t: ResultsT }) {
  // The artboard reads a scale from its top: five stars first.
  const cells = question.kind === "scale_1_5" ? [...(question.distribution ?? [])].reverse() : (question.distribution ?? []);
  const total = Math.max(1, ...cells.map((cell) => cell.count));

  return (
    <Panel>
      <article aria-labelledby={`q-${question.id}`}>
        <h3 id={`q-${question.id}`} className="text-label text-fg-heading">
          <bdi>{question.prompt}</bdi>
          {/* ★ A withheld question publishes NO count (`DEC-163`): two reads a response apart would say which
              question the newest respondent answered. */}
          {question.answeredCount !== null ? (
            <span className="font-normal text-fg-muted">
              {" · "}
              {t("answers", { count: question.answeredCount, value: formatNumber(question.answeredCount) })}
              {question.mean !== null ? ` · ${t("mean", { value: formatNumber(question.mean) })}` : null}
            </span>
          ) : null}
        </h3>

        {question.withheld ? (
          <p className="mt-2 text-body-sm text-fg-muted">{t("questionWithheld")}</p>
        ) : question.texts ? (
          <ul className="mt-3 flex flex-col gap-2">
            {question.texts.map((text, index) => (
              <li key={index} className="text-body-sm text-fg-body">
                «<bdi>{text}</bdi>»
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {cells.map((cell) => {
              const label =
                cell.label ?? (cell.value !== undefined ? t("stars", { count: cell.value, value: formatNumber(cell.value) }) : "");
              return (
                <li key={cell.id ?? cell.value} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
                  <span className="text-body-sm text-fg-body">
                    <bdi>{label}</bdi>
                  </span>
                  <Progress value={cell.count} max={total} label={label} valueText={formatNumber(cell.count)} />
                  <span className="text-body-sm text-fg-muted">{formatNumber(cell.count)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </Panel>
  );
}
