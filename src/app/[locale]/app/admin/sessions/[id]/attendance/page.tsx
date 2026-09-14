import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getAttendanceReport, listUncheckedConfirmedRsvps } from "@/lib/dal/checkin";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { getRatingsForAdmin } from "@/lib/dal/ratings";
import { requireSession } from "@/lib/dal/session";
import { markManually } from "./actions";
import { ManualMarkForm } from "./manual-mark-form";

// SCR-044 · /app/admin/sessions/[id]/attendance (REQ-CHK-008, REQ-CHK-012,
// REQ-RAT-005). Staff — admin OR moderator (REQ-ADM-020's "event-day
// operations"): `getAttendanceReport()` returns null for a plain member,
// the same 404-not-message pattern every other admin screen uses. The CSV
// export and the per-rater ratings section are admin-only WITHIN this
// staff-accessible page, not a reason to 404 the whole screen for a
// moderator — REQ-RAT-005 says a moderator lacks that one thing, not this
// one.

const STATUS_LABEL: Record<string, string> = {
  confirmed: "statusConfirmed",
  waitlisted: "statusWaitlisted",
  cancelled: "statusCancelled",
  late_cancelled: "statusLateCancelled",
};

export default async function AttendancePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [report, unchecked, prefs, session, t] = await Promise.all([
    getAttendanceReport(locale, id),
    listUncheckedConfirmedRsvps(locale, id),
    getOrgPrefs(locale),
    requireSession(locale),
    getTranslations("admin.attendance"),
  ]);
  if (report === null) notFound();

  const isAdmin = session.role === "admin";
  const ratings = isAdmin ? await getRatingsForAdmin(locale, id) : [];

  const num = (n: number) => formatNumber(n, prefs.numerals);
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

      <section aria-labelledby="summary" className="mt-8 rounded-field border border-edge p-5">
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
          <div>
            <dt className="text-body-sm text-fg-muted">{t("attendanceRateLabel")}</dt>
            <dd className="text-label text-fg-heading">{ratePct === null ? <span className="font-normal text-fg-muted">{t("attendanceRateEmpty")}</span> : t("attendanceRateValue", { value: num(ratePct) })}</dd>
          </div>
        </dl>
        {isAdmin ? (
          <a href={`/api/admin/exports/attendance/${id}`} className="mt-4 inline-block text-body-sm text-fg-heading underline underline-offset-4">
            {t("exportCsv")}
          </a>
        ) : null}
      </section>

      <section aria-labelledby="manual" className="mt-10 max-w-2xl border-t border-edge pt-8">
        <h2 id="manual" className="text-h2 text-fg-heading">
          {t("manualTitle")}
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">{t("manualIntro")}</p>
        {report.sessionState !== "in_progress" ? (
          <p role="status" className="mt-3 rounded-field border border-edge bg-silver-100 p-3 text-body-sm text-fg-body">
            {t("manualNotOpen")}
          </p>
        ) : (
          <ManualMarkForm action={markManually.bind(null, locale as Locale, id)} unchecked={unchecked} />
        )}
      </section>

      <section aria-labelledby="list" className="mt-10 border-t border-edge pt-8">
        <h2 id="list" className="text-h2 text-fg-heading">
          {t("listTitle")}
        </h2>
        {report.rows.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("empty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-start text-body-sm">
              <thead>
                <tr className="border-b border-edge text-fg-muted">
                  <th scope="col" className="py-2 pe-4 text-start font-normal">
                    {t("colName")}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start font-normal">
                    {t("colStatus")}
                  </th>
                  <th scope="col" className="py-2 pe-4 text-start font-normal">
                    {t("colArrival")}
                  </th>
                  <th scope="col" className="py-2 text-start font-normal">
                    {t("colMethod")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.memberId} className="border-b border-edge">
                    <td className="min-w-0 py-2 pe-4 text-fg-heading">
                      <bdi>{r.displayName ?? r.memberId}</bdi>
                    </td>
                    <td className="py-2 pe-4 text-fg-body">{r.isWalkIn ? t("statusWalkIn") : r.isNoShow ? t("statusNoShow") : t(STATUS_LABEL[r.rsvpStatus ?? ""] ?? "statusConfirmed")}</td>
                    <td className="py-2 pe-4 text-fg-body">{r.arrivedAt ? <bdi>{formatDateTime(r.arrivedAt, prefs.numerals, prefs.timeZone, locale)}</bdi> : "—"}</td>
                    <td className="py-2 text-fg-body">
                      {r.method === "code" ? t("methodCode") : r.method === "manual" ? <span className="text-fg-heading">{t("manualBadge")}</span> : "—"}
                    </td>
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
                <li key={r.id} className="rounded-field border border-edge p-4">
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
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
