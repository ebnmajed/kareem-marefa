import { getTranslations } from "next-intl/server";
import { AttendanceOutcome } from "@/components/checkin/attendance-outcome";
import { AwardState, readAward } from "@/components/checkin/award-state";
import type { SlotProps } from "@/components/sessions/slots";
import { formatNumber, formatTime } from "@/components/sessions/numerals";
import { CompletionMoment } from "@/components/scoring/completion-moment";
import { CompletionFigure } from "@/components/scoring/moment-completion";
import { DownloadIcon } from "@/components/ui/icons";
import { listMyCertificates } from "@/lib/dal/certificates";
import { getSessionCompletion } from "@/lib/dal/points";
import type { EventSession } from "@/lib/dal/sessions";

// The completed session's outcome — `EventDone.dc.html:40-53`, `M10a.md` §7, REQ-UIX-061, REQ-CHK-018,
// REQ-PTS-015, REQ-UIX-015 (ask 4).
//
// The coin with the amount, the fact («حضرت» / «لم تُسجّل حضورك» — `checkin`'s `AttendanceOutcome`, the matrix's
// two ended cells), when the member checked in, and what the award is: paid, pending, or not counted —
// `checkin`'s `AwardState`, a state read from the data and never a message fired once. ★ Nothing here computes
// an amount: the figure is `scoring`'s award state, which shares every condition with `award_points()`.
//
// ★ MOMENT 3 IS SCORING'S, REUSED (DEC-209 §2): when the award is paid, the coin's figure is `CompletionFigure`
// inside `CompletionMoment`, keyed `completion:<ledger entry>`, so the outcome card, `SCR-022` and the home's
// week share one claim — whichever the member opens first plays. The server draws the figure whole; a hard
// load, a second visit and reduced motion show it at rest.
//
// A presenter's own completed session reads «قدّمت هذه الجلسة», with no amount: the presenter's award is not a
// DTO this page can read, and a figure is never a literal (contract 7). «شاهد ملخصك» has no screen (DEC-209).

export async function OutcomeCard({ session, slot }: { session: EventSession; slot: SlotProps }) {
  const t = await getTranslations("sessions.event");
  const relation = session.viewerRelation;

  if (relation === "presenter") {
    return <p className="text-body font-bold text-fg-heading">{t("presentedIt")}</p>;
  }
  if (relation !== "attended" && relation !== "absent") return null;

  const [award, completion] = await Promise.all([readAward(slot.locale, session.id), relation === "attended" ? getSessionCompletion(slot.locale, session.id).catch(() => null) : null]);
  const points = award && (award.state === "paid" || award.state === "pending") ? award.points : null;
  const coinText = points !== null ? `+${formatNumber(points)}` : null;

  const coin = coinText ? (
    <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-tile bg-accent font-display text-play-sm font-extrabold text-on-accent" dir="ltr">
      {completion ? <CompletionFigure text={coinText} /> : coinText}
    </span>
  ) : null;

  const body = (
    <div className="flex items-start gap-3">
      {coin}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <AttendanceOutcome {...slot} />
        {relation === "attended" && session.checkedInAt ? (
          <p className="text-caption text-fg-muted">
            <bdi>{t("checkedInAt", { value: formatTime(session.checkedInAt, session.timeZone, slot.locale) })}</bdi>
            {completion?.award.paidAt ? (
              <>
                {" · "}
                <bdi>{t("paidSince", { value: formatTime(completion.award.paidAt, session.timeZone, slot.locale) })}</bdi>
              </>
            ) : null}
          </p>
        ) : null}
        <AwardState sessionId={session.id} locale={slot.locale} variant="inline" />
      </div>
    </div>
  );

  return (
    <div aria-label={t("outcomeLabel")} role="group" className="flex flex-col gap-3">
      {completion ? (
        <CompletionMoment locale={slot.locale} completion={completion}>
          {body}
        </CompletionMoment>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * «شهادتك جاهزة» — the member's own issued certificate for this session, once its PDF has rendered, through
 * `designer`'s audited download route, never a URL signed at render time (DEC-177, DEC-178). Nothing while it
 * has not rendered, so no link can 404. The serial is a code, in `<bdi>`.
 */
export async function CertificateRow({ sessionId, locale }: { sessionId: string; locale: string }) {
  const [{ certificates }, t] = await Promise.all([listMyCertificates(locale), getTranslations("sessions.event")]);
  const mine = certificates.find((c) => c.sessionId === sessionId && c.state === "issued" && c.downloadHref);
  if (!mine?.downloadHref) return null;
  return (
    <a
      href={mine.downloadHref}
      className="flex items-center gap-3 rounded-panel bg-fg-heading p-3 text-canvas no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-bold">{t("certificateReady")}</span>
        <span className="text-caption">{t.rich("certificateKind", { serial: mine.serial, bdi: (c) => <bdi>{c}</bdi> })}</span>
      </span>
      <DownloadIcon aria-hidden="true" className="shrink-0 text-[1.25rem]" />
      <span className="sr-only">{t("actions.certificate")}</span>
    </a>
  );
}

/** The member's certificate link alone, for the bar's «شهادتك». */
export async function myCertificateHref(locale: string, sessionId: string): Promise<string | null> {
  const { certificates } = await listMyCertificates(locale);
  return certificates.find((c) => c.sessionId === sessionId && c.state === "issued" && c.downloadHref)?.downloadHref ?? null;
}
