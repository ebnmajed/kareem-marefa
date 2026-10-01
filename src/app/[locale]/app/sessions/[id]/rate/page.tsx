import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import type { StarLabels } from "@/components/ui";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardMedia } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { StarInput } from "@/components/ui/star-input";
import type { Locale } from "@/i18n/routing";
import { getSessionPoster } from "@/lib/dal/posters";
import { getRatePageData, type RatingDTO } from "@/lib/dal/ratings";
import { getSessionHeading, type SessionHeading } from "@/lib/dal/sessions";
import { getSurveyForMember } from "@/lib/dal/surveys";
import { RateForm } from "./rate-form";

// SCR-015 · /app/sessions/[id]/rate — rebuilt from `Rate.dc.html` (wave 19, DEC-213, DEC-214 §3,
// REQ-UIX-066), deleted first and written from the artboard (DEC-208). The kept-behaviour table is
// `docs/plan/notes/event.md` § «Wave 19 — plan» §2; each comment below names its row's requirement.
//
// The artboard's order: the top row (back · «قيّم الجلسة») · the session's mini-row with «حضرت» ·
// two star rows · the comment with «N من 2000» · the anonymity panel · the bottom bar with the submit
// and the window line. ★★ The survey is not drawn and stays (REQ-SUR-004, DEC-213 §5.90): its section
// sits after the panel and before the bar, inside the form — see `rate-form.tsx`.
//
// Roles: checked-in attendees (REQ-RAT-001). A presenter reaching this URL for their own session is
// told they are not checked in — REQ-CHK-011 keeps a presenter from checking in, so the gate falls out
// of the requirement it depends on. The screen explains; `ratings_write_self` decides.
//
// The states, in the order the page tests them:
//   · an id the viewer cannot see       → notFound(), never a rule about a session not there for them
//   · not completed / not checked in    → the reason and the way back — never a 404 (DEC-213 §2.2)
//   · the window has closed             → the rating, read-only, and no bar (REQ-RAT-003)
//   · open                              → the form, pre-filled when there is a rating to edit
//   · `?rated=1`                        → an in-page receipt above the form, never a toast (§5.92)
//
// ★ `16` §9.2a: nothing here shows the time a rating was made.

export default async function RatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ rated?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { rated } = await searchParams;

  const [heading, data, survey, poster, t, tSurvey] = await Promise.all([
    getSessionHeading(locale, id),
    getRatePageData(locale, id),
    // ★ `null` for a session with no survey — REQ-SUR-001's «shows nothing about one, anywhere» is the
    // absence of a row, not a flag to read.
    getSurveyForMember(locale, id),
    getSessionPoster(locale, id).catch(() => null),
    getTranslations("ratings"),
    getTranslations("survey.rate"),
  ]);
  if (!heading) notFound();

  const { eligibility, minAggregate, timeZone } = data;
  const sessionHref = `/app/sessions/${heading.id}`;
  const starLabels = Array.from({ length: 5 }, (_, i) => t("form.starCount", { count: i + 1, value: formatNumber(i + 1) })) as unknown as StarLabels;

  const top = (
    <div className="flex items-center gap-2.5 pt-1">
      <Link
        href={sessionHref}
        aria-label={t("form.back")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading"
      >
        <ArrowIcon direction="back" aria-hidden="true" className="text-[1.125rem]" />
      </Link>
      <h1 className="font-display text-play-sm font-extrabold text-fg-heading">{t("form.title")}</h1>
    </div>
  );

  // «حضرت» only for a viewer who holds an active check-in (REQ-RAT-001, REQ-CHK-017).
  const mini = <SessionMiniRow heading={heading} imageUrl={poster?.imageUrl ?? null} attended={Boolean(eligibility.checkInId)} locale={locale} />;

  const readOnly = (existing: RatingDTO, size: "md" | "lg") => (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {(
        [
          ["sessionLabel", existing.sessionStars],
          ["presenterLabel", existing.presenterStars],
        ] as const
      ).map(([key, value]) => (
        <StarInput
          key={key}
          readOnly
          value={value as 1 | 2 | 3 | 4 | 5}
          legend={t(`form.${key}`)}
          label={`${t(`form.${key}`)}: ${starLabels[value - 1]}`}
          starLabels={starLabels}
          size={size}
        />
      ))}
    </div>
  );

  const back = (
    <div>
      <ButtonLink href={sessionHref} variant="secondary" size="md">
        {t("form.backToSession")}
      </ButtonLink>
    </div>
  );

  // Not completed · not checked in — the reason and the way back (REQ-RAT-001, REQ-RAT-003, DEC-213 §2.2).
  if (eligibility.reason === "not_completed" || eligibility.reason === "not_checked_in") {
    return (
      <Screen>
        {top}
        {mini}
        <EmptyState
          title={eligibility.reason === "not_completed" ? t("states.notCompleted") : t("states.notCheckedIn")}
          action={{ label: t("form.backToSession"), href: sessionHref }}
        />
      </Screen>
    );
  }

  // The window has closed — the form is unavailable and the rating immutable (REQ-RAT-003). No bar.
  if (!eligibility.eligible) {
    return (
      <Screen>
        {top}
        {mini}
        <Panel tone="ended">
          <p className="text-label text-fg-heading">{t("prompt.closed")}</p>
          {eligibility.existing ? (
            <div className="mt-4 flex flex-col gap-4">
              {readOnly(eligibility.existing, "md")}
              {eligibility.existing.comment ? (
                <div>
                  <p className="text-body-sm text-fg-muted">{t("form.commentLabel")}</p>
                  <p className="mt-1 whitespace-pre-line text-body text-fg-body">
                    <bdi>{eligibility.existing.comment}</bdi>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </Panel>
        {back}
      </Screen>
    );
  }

  const windowNote = eligibility.windowClosesAt ? (
    <>
      {t("form.windowClosesAt", { date: formatDate(eligibility.windowClosesAt, timeZone, locale) })}
      <span aria-hidden="true"> · </span>
      {t("form.windowEditable")}
    </>
  ) : null;

  return (
    <Screen>
      {top}
      {mini}

      {rated && eligibility.existing ? (
        // ★ News about the member's own act: a status on the page, not a toast that has gone (DEC-213 §5.92,
        // DEC-141 ruling 2). The survey's receipt says both things happened; a session with no survey says
        // exactly what it said before (REQ-SUR-001).
        <div role="status">
          <Panel tone="success">
            <p className="text-label text-fg-heading">{survey?.answered ? tSurvey("sent") : t("form.submitted")}</p>
            <p className="mt-1 text-body-sm text-fg-body">{t("form.submittedBody")}</p>
            <div className="mt-3">{readOnly(eligibility.existing, "md")}</div>
            <div className="mt-4">{back}</div>
          </Panel>
        </div>
      ) : null}

      <RateForm
        locale={locale as Locale}
        sessionId={heading.id}
        checkInId={eligibility.checkInId ?? ""}
        existing={eligibility.existing}
        survey={survey}
        // The promise, honestly — the threshold read from the org's setting AND the admin exception
        // (REQ-RAT-004 … 006, D36, OQ-009): a promise that omits the exception is not one.
        notice={<AnonymityNotice text={t("form.anonymityNotice", { min: minAggregate, value: formatNumber(minAggregate) })} />}
        windowNote={windowNote}
      />
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="flex max-w-xl flex-col gap-5">{children}</div>;
}

function AnonymityNotice({ text }: { text: string }) {
  return (
    <Panel tone="neutral">
      <p className="text-body-sm text-fg-muted">{text}</p>
    </Panel>
  );
}

/**
 * The session the member is rating: the poster, the title, every presenter with their company
 * (contract 8 — joined, never only the first), the date in the session's zone, and «حضرت».
 * Every interpolated name in `<bdi>`.
 */
async function SessionMiniRow({ heading, imageUrl, attended, locale }: { heading: SessionHeading; imageUrl: string | null; attended: boolean; locale: string }) {
  const t = await getTranslations("ratings.form");
  const parts = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(heading.presenters.map((_, i) => String(i)));
  const presenters = parts.map((part, i) => {
    if (part.type === "literal") return <span key={i}>{part.value}</span>;
    const p = heading.presenters[Number(part.value)]!;
    return (
      <span key={i}>
        {p.displayName && p.companyName ? (
          t.rich("presenterLine", { name: p.displayName, company: p.companyName, n: (c) => <bdi>{c}</bdi>, c: (c) => <bdi>{c}</bdi> })
        ) : (
          <bdi>{p.displayName ?? p.companyName}</bdi>
        )}
      </span>
    );
  });
  const meta: ReactNode[] = [];
  if (heading.presenters.length > 0) meta.push(presenters);
  if (heading.startsAt) meta.push(formatDate(heading.startsAt, heading.timeZone, locale));
  if (attended) meta.push(t("attended"));

  return (
    <Card density="compact">
      {/* Inside a wrapper, so the card's compact media width does not reach it: the artboard's 44 × 56 thumbnail. */}
      <div className="w-11 shrink-0 self-center ms-2.5">
        <CardMedia src={imageUrl} placeholderFrom={heading.title} aspect="4/5" className="rounded-field" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-2.5">
        <p className="text-body-sm font-bold text-fg-heading">
          <bdi>{heading.title}</bdi>
        </p>
        {meta.length > 0 ? (
          <p className="text-caption text-fg-muted">
            {meta.map((node, i) => (
              <span key={i}>
                {i > 0 ? <span aria-hidden="true"> · </span> : null}
                {node}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
