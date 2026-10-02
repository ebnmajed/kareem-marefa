import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { formatNumber, formatTime } from "@/components/sessions/numerals";
import { dayShortName, namesDays } from "@/components/checkin/day-name";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Stat } from "@/components/ui/stat";
import { SubmitButton } from "@/components/ui/submit-button";
import { TagChip } from "@/components/ui/tag-chip";
import { Textarea } from "@/components/ui/textarea";
import { getAttendanceReport, getHostView, type AttendanceRow } from "@/lib/dal/checkin";
import { getRatingsForAdmin } from "@/lib/dal/ratings";
import { requireSession } from "@/lib/dal/session";
import { checkInCeiling, resolveDay } from "@/lib/session-status";
import { markManually, markManuallyNoScript, removeCheckInAction } from "./actions";
import { AttendanceBoard, type BoardRow } from "./_components/attendance-board";
import { CodeCard } from "./_components/code-card";

// SCR-044 · the hub's الحضور tab, rebuilt from `AdminAttendance.dc.html` (REQ-UIX-090, STORY-UIX-080; `M11a.md` §5).
// Written after the old page and its two forms were deleted (DEC-208, `bdbfb502`). What it had to keep, and the
// requirement behind each, is `docs/plan/notes/checkin.md` W21.2 (as amended by W21.10).
//
// ★ THE JOB: attendance is run live from here — the code, its rotation, «أبطل», the door, a manual mark with its
// reason, the room's check-ins arriving without a reload, and an admin's revoke through `remove_check_in()`, which
// writes `DEC-172`'s compensating row. This page renders NOTHING of the hub's header (contract 4): the title, the
// status, the breadcrumb and «شاشة التقديم» are `sessions'` layout's.
//
// Regions in the artboard's order: (the day, above one day) · the five figures and the code card · the toolbar — the
// chips, «تسجيل يدوي», «CSV» · the table. Below the table, for an admin on a completed session only, the per-rater
// ratings (REQ-RAT-005, DEC-228 §4.6) — never on a page that refreshes, because every read of them is audited.
//
// Staff only, decided at the data (`getAttendanceReport()` returns null for anyone else → 404), never by a layout.

type Show = "all" | "present" | "absent";

/** The request's instant — read once, outside render's purity rule, so every window below is judged at one moment. */
function readClock(): number {
  return Date.now();
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ day?: string; show?: string; switchError?: string; revokeError?: string; manualError?: string; manual?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [report, session, t, tDays] = await Promise.all([
    getAttendanceReport(locale, id),
    requireSession(locale),
    getTranslations("checkin.attendance"),
    getTranslations("sessions.days"),
  ]);
  if (report === null) notFound();

  const isAdmin = session.role === "admin";
  const state = report.sessionState;
  const finished = state === "completed" || state === "archived";
  const cancelled = state === "cancelled";
  // The live card's read — only while the room can still be run. `ensure_check_in_code()` issues no code outside the
  // window (REQ-CHK-004), and the host view's gate is its own (REQ-CHK-014).
  //
  // ★ A failed READ of the code does not take the tab down with it (the lead's phone run of `e891d707`): the list,
  // the figures, the manual mark and the revoke stand on `getAttendanceReport()` alone, and running the room is
  // exactly when a transient upstream error must not blank them. The card says the code could not be shown; the
  // error is still logged, and refusals (`not_authorized`, `not_open`) were never thrown — they are `null` / no code.
  let codeUnavailable = false;
  let view: Awaited<ReturnType<typeof getHostView>> = null;
  if (!finished && !cancelled) {
    try {
      view = await getHostView(locale, id);
    } catch (error) {
      console.error("SCR-044: the code card's read failed", error);
      codeUnavailable = true;
    }
  }

  // ── the day (DEC-119) — the form's answer, validated, never the clock's alone ──
  const manyDays = namesDays(report.days.length);
  const asked = report.days.find((d) => d.id === sp.day);
  const selected = asked ?? report.days.find((d) => d.id === view?.day?.id) ?? resolveDay(report.days) ?? report.days[0] ?? null;
  const dayIndex = selected ? report.days.findIndex((d) => d.id === selected.id) : -1;
  const counts = report.byDay?.find((c) => c.dayId === selected?.id) ?? null;
  const now = readClock();
  const dayStarted = selected ? Date.parse(selected.startsAt) <= now : false;
  const ceiling = dayIndex >= 0 ? checkInCeiling(report.days, dayIndex) : null;

  // ★ Who may mark by hand (REQ-CHK-008, REQ-CHK-017, DEC-228 §4.6): an admin at any time once the day has begun, a
  // completed session included; a moderator inside the RPC's own window. The RPC re-checks both.
  const canMark =
    !!selected &&
    dayStarted &&
    !cancelled &&
    (isAdmin || ((state === "published" || state === "in_progress" || state === "completed") && (ceiling === null || now < ceiling)));

  const cellOf = (r: AttendanceRow) => r.days.find((c) => c.dayId === selected?.id) ?? null;
  const tz = report.timeZone; // D8: the session's zone, as the host view uses
  const statusOf = (r: AttendanceRow): BoardRow["status"] => {
    const c = cellOf(r);
    if (c?.checkedIn) return "present";
    if (c?.removed) return "removed";
    // D7: before the day starts nobody has missed it.
    if (r.rsvpStatus === "confirmed" && dayStarted) return "absent";
    return "none";
  };

  const allRows: BoardRow[] = report.rows.map((r) => {
    const c = cellOf(r);
    const status = statusOf(r);
    const holdsSeat = r.rsvpStatus === "confirmed" || r.rsvpStatus === "waitlisted";
    return {
      memberId: r.memberId,
      name: r.displayName,
      avatarUrl: r.avatarUrl ?? null,
      teamColor: r.teamColor ?? null,
      reservation: r.rsvpStatus ?? "none",
      time: c?.checkedIn && c.arrivedAt ? formatTime(c.arrivedAt, tz, locale) : null,
      method: c?.checkedIn ? (c.method === "manual" ? { kind: "manual", by: c.markedByName ?? null } : { kind: "code" }) : null,
      status,
      removal: status === "removed" ? { reason: c?.removalReason ?? null, by: c?.removedByName ?? null } : null,
      days: manyDays ? t("daysAttended", { value: formatNumber(r.daysAttended), total: formatNumber(report.days.length) }) : null,
      complete: manyDays && r.attendanceComplete,
      // K13/K14: a seat of some kind, missing on THIS day — a removed member may be marked again.
      canMark: canMark && holdsSeat && status !== "present",
      // K16: admin-only, an ACTIVE check-in on THIS day.
      canRevoke: isAdmin && status === "present",
    };
  });

  const show: Show = sp.show === "present" || sp.show === "absent" ? sp.show : "all";
  const rows = show === "all" ? allRows : allRows.filter((r) => r.status === show);
  const candidates = allRows.filter((r) => r.canMark).map((r) => ({ value: r.memberId, label: r.name ?? r.memberId }));

  const query = (next: Partial<{ day: string; show: Show; manual: boolean }>) => {
    const q = new URLSearchParams();
    if (next.manual) q.set("manual", "1");
    const day = next.day ?? (asked ? asked.id : undefined);
    if (day) q.set("day", day);
    const s = next.show ?? show;
    if (s !== "all") q.set("show", s);
    const qs = q.toString();
    return `/app/admin/sessions/${id}/attendance${qs ? `?${qs}` : ""}`;
  };

  // ★ The empty list's next move (REQ-UIX-012, the lead's ruling on K32): mark someone by hand while anyone may be
  // marked; else project the code while the host screen is offered; else the session's own page.
  const hostOffered = state === "published" || state === "in_progress";
  const emptyAction =
    candidates.length > 0
      ? { label: t("manualOpen"), href: query({ manual: true }) }
      : hostOffered
        ? { label: t("hostScreen"), href: `/app/sessions/${id}/host` }
        : { label: t("sessionPage"), href: `/app/sessions/${id}` };

  const num = formatNumber;
  const pct = (rate: number | null) => (rate === null ? "—" : t("attendanceRateValue", { value: num(Math.round(rate * 100)) }));
  // REQ-PTS-015: before completion nothing has been paid, so the revoke says «won't earn», not «reversed». Stored state.
  const paysOnCompletion = !finished;
  const ratings = isAdmin && finished ? await getRatingsForAdmin(locale, id) : [];

  return (
    <div className="flex flex-col gap-4">
      {manyDays ? (
        <div role="group" aria-label={t("dayLabel")} className="flex flex-wrap gap-2">
          {report.days.map((d) => (
            <TagChip key={d.id} label={dayShortName(d, report.days.length, tDays) ?? ""} href={query({ day: d.id })} selected={d.id === selected?.id} />
          ))}
        </div>
      ) : null}

      {/* ★ Five figures at 1fr and the code card at 2fr from `lg` — never narrower than its own one line, so the code
          never runs out of it (the lead's review of the 1280 capture). Two, then three, columns below, the card on its
          own full-width row. Above one day a sixth figure joins the 1fr run (`--figures`). */}
      <div
        className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${cancelled ? "lg:grid-cols-[repeat(var(--figures),minmax(0,1fr))]" : "lg:grid-cols-[repeat(var(--figures),minmax(0,1fr))_minmax(max-content,2fr)]"}`}
        style={{ "--figures": manyDays ? 6 : 5 } as CSSProperties}
      >
        {/* ★ Every figure is read (contract 7). «محجوز» counts confirmed (D1); the rate is `attendanceRate()`'s, the
            one definition (DEC-228 §3.4); «حاضر», «بلا حجز» and «يدوي» are the selected day's. */}
        <Stat label={t("figures.reserved")} value={num(report.counts.confirmed)} />
        <Stat label={t("figures.present")} value={num(counts?.present ?? 0)} />
        <Stat label={t("figures.rate")} value={pct(counts ? counts.rate : report.attendanceRate)} />
        <Stat label={t("figures.walkIns")} value={num(counts?.walkedIn ?? 0)} />
        <Stat label={t("figures.manual")} value={num(counts?.manual ?? 0)} />
        {manyDays ? (
          // K5: «I could not ask» is an em dash, never a zero.
          <Stat
            label={t("completedAllDays")}
            value={report.counts.completedAllDays === null ? "—" : num(report.counts.completedAllDays)}
            hint={report.requireAllDays ? t("requireAllDaysOn") : t("requireAllDaysOff")}
          />
        ) : null}
        {cancelled ? null : (
          <CodeCard
            locale={locale as Locale}
            sessionId={id}
            view={view}
            day={selected}
            finalRate={finished ? pct(report.attendanceRate) : null}
            startsAt={selected ? formatTime(selected.startsAt, tz, locale) : null}
            dayStarted={dayStarted}
            codeUnavailable={codeUnavailable}
            switchError={sp.switchError}
            revokeError={sp.revokeError}
          />
        )}
      </div>

      <AttendanceBoard
        rows={rows}
        candidates={candidates}
        dayId={selected?.id ?? null}
        sessionTitle={report.sessionTitle}
        paysOnCompletion={paysOnCompletion}
        canMark={candidates.length > 0}
        manyDays={manyDays}
        csvHref={isAdmin ? `/api/admin/exports/attendance/${id}` : null}
        markAction={markManually.bind(null, locale as Locale, id)}
        removeAction={removeCheckInAction.bind(null, locale as Locale, id)}
        emptyAction={emptyAction}
        clearFilter={show === "all" ? undefined : { label: t("filter.all"), href: query({ show: "all" }) }}
        sheetRequested={sp.manual === "1"}
        filters={
          <div role="group" aria-label={t("filter.label")} className="flex flex-wrap items-center gap-2">
            <TagChip label={t("filter.all")} count={allRows.length} href={query({ show: "all" })} selected={show === "all"} />
            <TagChip label={t("filter.present")} count={counts?.present ?? 0} href={query({ show: "present" })} selected={show === "present"} />
            {/* D7: uncounted until the day has begun. */}
            <TagChip label={t("filter.absent")} count={dayStarted ? (counts?.noShowed ?? 0) : undefined} href={query({ show: "absent" })} selected={show === "absent"} />
          </div>
        }
      />

      {/* K34: the manual mark without JavaScript — the sheet and the combobox need it, so the same mark posts here. */}
      {candidates.length > 0 ? (
        <noscript>
          <form action={markManuallyNoScript.bind(null, locale as Locale, id)} className="flex max-w-md flex-col gap-3">
            <input type="hidden" name="dayId" value={selected?.id ?? ""} />
            <Field id="manual-member-nojs" label={t("sheetMember")} required>
              <Select name="memberId" defaultValue="">
                <option value="" disabled>
                  {t("memberPlaceholder")}
                </option>
                {candidates.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="manual-reason-nojs" label={t("reasonLabel")} required>
              <Textarea name="reason" rows={2} maxLength={300} />
            </Field>
            <SubmitButton>{t("mark")}</SubmitButton>
            {sp.manualError ? <p role="alert">{t(`error.${KNOWN_MANUAL.has(sp.manualError) ? sp.manualError : "unknown"}`)}</p> : null}
          </form>
        </noscript>
      ) : null}

      {isAdmin && finished ? (
        <section aria-labelledby="ratings" className="mt-6 flex flex-col gap-3">
          <h2 id="ratings" className="text-h3 text-fg-heading">
            {t("ratingsTitle")}
          </h2>
          {ratings.length === 0 ? (
            <p className="text-body-sm text-fg-muted">{t("ratingsEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-edge rounded-card border border-edge">
              {ratings.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <p className="text-label text-fg-heading">
                    <bdi>{r.member?.displayName ?? r.member?.id ?? ""}</bdi>
                  </p>
                  <p className="mt-1 text-body-sm text-fg-muted">
                    {t("sessionStars")}: <bdi>{num(r.sessionStars)}</bdi> · {t("presenterStars")}: <bdi>{num(r.presenterStars)}</bdi>
                  </p>
                  {r.comment ? (
                    <p className="mt-1 text-body-sm text-fg-body">
                      <bdi>{r.comment}</bdi>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

const KNOWN_MANUAL = new Set(["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in", "overlap", "unknown"]);
