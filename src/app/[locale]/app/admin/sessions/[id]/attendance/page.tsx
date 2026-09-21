import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Panel } from "@/components/ui/panel";
import { getAttendanceReport, listUncheckedForAdminManualMark, type AttendanceRow, type UncheckedAttendee } from "@/lib/dal/checkin";
import { dayShortName, namesDays } from "@/components/checkin/day-name";
import { resolveDay } from "@/lib/session-status";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { getRatingsForAdmin } from "@/lib/dal/ratings";
import { requireSession } from "@/lib/dal/session";
import { markManually, removeCheckInAction } from "./actions";
import { ManualMarkForm } from "./manual-mark-form";
import { RemoveCheckInForm } from "./remove-check-in-form";

// SCR-044 · /app/admin/sessions/[id]/attendance (REQ-CHK-008, REQ-CHK-012,
// REQ-CHK-017, REQ-RAT-005). Staff — admin OR moderator (REQ-ADM-020's
// "event-day operations"): `getAttendanceReport()` returns null for a plain
// member, the same 404-not-message pattern every other admin screen uses.
// The CSV export, the removal control and the per-rater ratings section are
// admin-only WITHIN this staff-accessible page, not a reason to 404 the
// whole screen for a moderator — REQ-RAT-005 says a moderator lacks those
// things, not this whole page.
//
// ★ DEC-137: this route moved to `checkin` this wave, and its strings moved
// with it — `checkin.attendance` (`checkin.json`), not `admin.attendance`
// (`admin.json`) anymore. The old namespace is still in `admin.json`,
// unused; deleting it is `console`'s call on request (one writer per file).

const STATUS_LABEL: Record<string, string> = {
  confirmed: "statusConfirmed",
  waitlisted: "statusWaitlisted",
  cancelled: "statusCancelled",
  late_cancelled: "statusLateCancelled",
};

// The phone card's classes (below `md`), and the table's from `md` up — the
// same elements either way (K2's header comment, at the table).
const ROW = "border-b border-edge max-md:block max-md:rounded-card max-md:border max-md:bg-surface max-md:p-4";
const CELL = "py-2 pe-4 max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:py-1 max-md:pe-0";

/** A phone card's line label — the column's header, drawn beside the value.
 *  `aria-hidden`: the header row already names the cell, and the cell's own
 *  accessible name must stay the value (the specs read it by that name). */
function CellLabel({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="shrink-0 text-fg-muted md:hidden">
      {children}
    </span>
  );
}

export default async function AttendancePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [report, unchecked, prefs, session, t, tDays] = await Promise.all([
    getAttendanceReport(locale, id),
    listUncheckedForAdminManualMark(locale, id),
    getOrgPrefs(locale),
    requireSession(locale),
    getTranslations("checkin.attendance"),
    getTranslations("sessions.days"),
  ]);
  if (report === null) notFound();

  // ── the days (DEC-119) ──────────────────────────────────────────────────
  //
  // ★ EVERY LIST BELOW IS BUILT FROM THE MATRIX `getAttendanceReport()`
  // already returns, not from a second query per day. `report.rows[].days` is
  // one cell per day per member, so «who is missing day 2» and «whose day 2
  // can be removed» are two filters over data already on the page.
  //
  // At one day `manyDays` is false: no column, no select, no extra stat — the
  // table wave 7 shipped, with the day travelling in a hidden field so the
  // RPC never has to resolve it from a clock that moved since this render.
  const manyDays = namesDays(report.days.length);
  const markableDays = report.days.map((d) => ({ id: d.id, label: dayShortName(d, Math.max(report.days.length, 2), tDays) ?? "" }));
  const defaultDayId = resolveDay(report.days)?.id ?? report.days[0]?.id ?? null;
  const asAttendee = (r: AttendanceRow): UncheckedAttendee => ({ memberId: r.memberId, displayName: r.displayName });
  const byDay = (pick: (row: AttendanceRow, dayId: string) => boolean): Record<string, UncheckedAttendee[]> =>
    Object.fromEntries(report.days.map((d) => [d.id, report.rows.filter((r) => pick(r, d.id)).map(asAttendee)]));

  // Missing THIS day, and holding a seat of some kind — the same population
  // `listUncheckedForAdminManualMark()` offers, evaluated per day.
  const markCandidatesByDay = byDay((r, dayId) => (r.rsvpStatus === "confirmed" || r.rsvpStatus === "waitlisted") && !r.days.find((c) => c.dayId === dayId)?.checkedIn);
  // An ACTIVE check-in on THIS day — the only thing `remove_check_in()` can act on.
  const removeCandidatesByDay = byDay((r, dayId) => !!r.days.find((c) => c.dayId === dayId)?.checkedIn);

  const isAdmin = session.role === "admin";
  const ratings = isAdmin ? await getRatingsForAdmin(locale, id) : [];
  // REQ-CHK-017: anyone with an ACTIVE check-in right now, confirmed or
  // walk-in alike — `remove_check_in()` doesn't care which, only that one
  // exists (`report.rows`' own `checkedIn` already means exactly that,
  // post the removed_at fix).
  const removeCandidates = report.rows.filter((r) => r.checkedIn).map(asAttendee);

  const num = (n: number) => formatNumber(n);
  const ratePct = report.attendanceRate === null ? null : Math.round(report.attendanceRate * 100);

  return (
    <>
      <p className="text-body-sm">
        <Link href="/app/admin/sessions" className="text-fg-heading underline underline-offset-4">
          {t("back")}
        </Link>
      </p>
      <h1 className="mt-2 text-h1 text-fg-heading">
        {t("title")} — <bdi>{report.sessionTitle}</bdi>
      </h1>

      <section aria-labelledby="summary" className="mt-8">
        <Panel>
          <h2 id="summary" className="text-h3 text-fg-heading">
            {t("summaryTitle")}
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {(
              [
                ["reserved", report.counts.reserved],
                ["confirmed", report.counts.confirmed],
                ["checkedIn", report.counts.checkedIn],
                ["walkedIn", report.counts.walkedIn],
                ["noShowed", report.counts.noShowed],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt className="text-body-sm text-fg-muted">{t(key)}</dt>
                <dd className="text-label text-fg-heading">{num(value)}</dd>
              </div>
            ))}
            {manyDays ? (
              <div>
                <dt className="text-body-sm text-fg-muted">{t("completedAllDays")}</dt>
                {/* ★ NULL until `scoring` publishes `session_attendance_complete()`
                    (contract 6). «Attended the session» has exactly one
                    definition and it is not this page's to guess — an em dash
                    is honest, a re-derived number would not be. */}
                <dd className="text-label text-fg-heading">{report.counts.completedAllDays === null ? "—" : num(report.counts.completedAllDays)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-body-sm text-fg-muted">{t("attendanceRateLabel")}</dt>
              <dd className="text-label text-fg-heading">{ratePct === null ? <span className="font-normal text-fg-muted">{t("attendanceRateEmpty")}</span> : t("attendanceRateValue", { value: num(ratePct) })}</dd>
            </div>
          </dl>
          {manyDays ? <p className="mt-3 text-body-sm text-fg-muted">{report.requireAllDays ? t("requireAllDaysOn") : t("requireAllDaysOff")}</p> : null}
          {isAdmin ? (
            <a href={`/api/admin/exports/attendance/${id}`} className="mt-4 inline-block text-body-sm text-fg-heading underline underline-offset-4">
              {t("exportCsv")}
            </a>
          ) : null}
        </Panel>
      </section>

      <section aria-labelledby="manual" className="mt-10 max-w-2xl border-t border-edge pt-8">
        <h2 id="manual" className="text-h2 text-fg-heading">
          {t("manualTitle")}
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">{t("manualIntro")}</p>
        {report.sessionState !== "in_progress" ? (
          <div role="status" className="mt-3">
            <Panel tone="info" className="text-body-sm text-fg-body">
              {t("manualNotOpen")}
            </Panel>
          </div>
        ) : (
          <ManualMarkForm
            action={markManually.bind(null, locale as Locale, id)}
            unchecked={manyDays ? report.rows.filter((r) => (r.rsvpStatus === "confirmed" || r.rsvpStatus === "waitlisted") && r.daysAttended < report.days.length).map(asAttendee) : unchecked}
            days={markableDays}
            defaultDayId={defaultDayId}
            candidatesByDay={markCandidatesByDay}
          />
        )}
      </section>

      {/* REQ-CHK-017, C3 — admin-only, unlike manual marking above: it needs
          nothing about the session's own state (`remove_check_in()` has no
          `in_progress` gate at all — a correction after the fact, once the
          report is being reviewed post-event, is exactly REQ-CHK-017's own
          case, not a live-session-only tool). "Design the reversal before
          the UI" (the lead's own framing): the SQL (0087) does the whole
          reversal — points, certificate, no-show symmetry — inline; this
          section is only ever a thin call onto it. */}
      {isAdmin ? (
        <section aria-labelledby="remove" className="mt-10 max-w-2xl border-t border-edge pt-8">
          <h2 id="remove" className="text-h2 text-fg-heading">
            {t("removeTitle")}
          </h2>
          <p className="mt-2 text-body-sm text-fg-muted">{t("removeIntro")}</p>
          <RemoveCheckInForm
            action={removeCheckInAction.bind(null, locale as Locale, id)}
            candidates={removeCandidates}
            sessionTitle={report.sessionTitle}
            days={markableDays}
            defaultDayId={defaultDayId}
            candidatesByDay={removeCandidatesByDay}
          />
        </section>
      ) : null}

      <section aria-labelledby="list" className="mt-10 border-t border-edge pt-8">
        <h2 id="list" className="text-h2 text-fg-heading">
          {t("listTitle")}
        </h2>
        {report.rows.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("empty")}</p>
        ) : (
          // REQ-NFR-007: a scrollable region is a keyboard stop (axe scrollable-region-focusable).
          //
          // ★ ONE TABLE, TWO LAYOUTS (wave 11, K2). From `md` up it is the table
          // waves 7 and 9 shipped, and a many-day grid may still scroll inside
          // this region. Below `md` the same rows reflow into stacked cards: the
          // header row is visually hidden (still in the tree, so a screen reader
          // still reads a table with headers), each row is a card, and each cell
          // is a line «column · value». A card grows DOWNWARDS by one line per
          // day and never sideways, so no `n` scrolls at 390 px — one day
          // included, whose 560 px table used to. The roles are explicit because
          // `display: block` on table parts may drop their implicit ones.
          <div className="mt-4 md:overflow-x-auto" tabIndex={0} role="region" aria-labelledby="list">
            {/* `min-w` grows with the day count, from `md` up only. */}
            <table
              role="table"
              className="w-full text-start text-body-sm max-md:block md:min-w-[var(--table-min)]"
              style={{ "--table-min": manyDays ? `${420 + report.days.length * 140}px` : "560px" } as CSSProperties}
            >
              <thead role="rowgroup" className="max-md:sr-only">
                <tr role="row" className="border-b border-edge text-fg-muted">
                  <th role="columnheader" scope="col" className="py-2 pe-4 text-start font-normal">
                    {t("colName")}
                  </th>
                  <th role="columnheader" scope="col" className="py-2 pe-4 text-start font-normal">
                    {t("colStatus")}
                  </th>
                  {manyDays ? (
                    <>
                      {report.days.map((d, i) => (
                        <th key={d.id} role="columnheader" scope="col" className="py-2 pe-4 text-start font-normal">
                          {markableDays[i].label}
                        </th>
                      ))}
                      <th role="columnheader" scope="col" className="py-2 text-start font-normal">
                        {t("colDays")}
                      </th>
                    </>
                  ) : (
                    <>
                      <th role="columnheader" scope="col" className="py-2 pe-4 text-start font-normal">
                        {t("colArrival")}
                      </th>
                      <th role="columnheader" scope="col" className="py-2 text-start font-normal">
                        {t("colMethod")}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody role="rowgroup" className="max-md:block max-md:space-y-3">
                {report.rows.map((r) => (
                  <tr key={r.memberId} role="row" className={ROW}>
                    <td role="cell" className={`${CELL} min-w-0 text-fg-heading max-md:text-label`}>
                      <bdi>{r.displayName ?? r.memberId}</bdi>
                    </td>
                    <td role="cell" className={`${CELL} text-fg-body`}>
                      <CellLabel>{t("colStatus")}</CellLabel>
                      <div className="min-w-0">
                        {/* `removed` is checked first — it overrides walk-in/no-show/rsvp
                            status, all of which a removal can make simultaneously true
                            (a removed walk-in is still `isWalkIn`, and a removed
                            confirmed member reads as `isNoShow` again per the RPC's own
                            symmetry — see `AttendanceRow`'s own comment). */}
                        {r.removed ? (
                          <>
                            <span className="text-fg-heading">{t("statusRemoved")}</span>
                            {r.removalReason ? <p className="mt-0.5 text-body-sm text-fg-muted">{t.rich("removedReason", { reason: r.removalReason, bdi: (c) => <bdi>{c}</bdi> })}</p> : null}
                          </>
                        ) : r.isWalkIn ? (
                          t("statusWalkIn")
                        ) : r.isNoShow ? (
                          t("statusNoShow")
                        ) : (
                          t(STATUS_LABEL[r.rsvpStatus ?? ""] ?? "statusConfirmed")
                        )}
                      </div>
                    </td>
                    {manyDays ? (
                      <>
                        {r.days.map((c, i) => (
                          <td key={c.dayId} role="cell" className={`${CELL} text-fg-body`}>
                            <CellLabel>{markableDays[i]?.label}</CellLabel>
                            <div className="min-w-0">
                              {c.checkedIn ? (
                                <>
                                  <span className="text-fg-heading">{t("dayPresent")}</span>
                                  {c.arrivedAt ? (
                                    <p className="mt-0.5 text-body-sm text-fg-muted">
                                      <bdi>{formatDateTime(c.arrivedAt, prefs.timeZone, locale)}</bdi>
                                    </p>
                                  ) : null}
                                </>
                              ) : c.removed ? (
                                <>
                                  <span>{t("dayRemoved")}</span>
                                  {c.removalReason ? (
                                    <p className="mt-0.5 text-body-sm text-fg-muted">{t.rich("removedReason", { reason: c.removalReason, bdi: (x) => <bdi>{x}</bdi> })}</p>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-fg-muted">{t("dayAbsent")}</span>
                              )}
                            </div>
                          </td>
                        ))}
                        <td role="cell" className={`${CELL} text-fg-body md:pe-0`}>
                          <CellLabel>{t("colDays")}</CellLabel>
                          <div className="min-w-0">
                            {t("daysAttended", { value: num(r.daysAttended), total: num(report.days.length) })}
                            {/* ★ Not derivable from the count beside it: with
                                `require_all_days` off, «1 من 3» IS complete.
                                This reads contract 6's predicate through
                                `session_complete_attendees()` and re-derives
                                nothing. */}
                            {r.attendanceComplete ? <span className="ms-2 text-fg-heading">{t("complete")}</span> : null}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td role="cell" className={`${CELL} text-fg-body`}>
                          <CellLabel>{t("colArrival")}</CellLabel>
                          <div className="min-w-0">{r.arrivedAt ? <bdi>{formatDateTime(r.arrivedAt, prefs.timeZone, locale)}</bdi> : "—"}</div>
                        </td>
                        <td role="cell" className={`${CELL} text-fg-body md:pe-0`}>
                          <CellLabel>{t("colMethod")}</CellLabel>
                          <div className="min-w-0">
                            {r.method === "code" ? t("methodCode") : r.method === "manual" ? <span className="text-fg-heading">{t("manualBadge")}</span> : "—"}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isAdmin ? (
        <section aria-labelledby="ratings" className="mt-10 max-w-2xl border-t border-edge pt-8">
          <h2 id="ratings" className="text-h2 text-fg-heading">
            {t("ratingsTitle")}
          </h2>
          <p className="mt-2 text-body-sm text-fg-muted">{t("ratingsNote")}</p>
          {ratings.length === 0 ? (
            <p className="mt-3 text-body text-fg-body">{t("ratingsEmpty")}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {ratings.map((r) => (
                <li key={r.id}>
                  <Panel>
                    <p className="text-label text-fg-heading">
                      <bdi>{r.member?.displayName ?? r.member?.id ?? ""}</bdi>
                    </p>
                    <p className="mt-1 text-body-sm text-fg-muted">
                      {t("sessionStars")}: {num(r.sessionStars)} · {t("presenterStars")}: {num(r.presenterStars)}
                    </p>
                    {r.comment ? (
                      <p className="mt-2 text-body-sm text-fg-body">
                        <bdi>{r.comment}</bdi>
                      </p>
                    ) : null}
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
