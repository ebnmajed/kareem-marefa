import { getTranslations } from "next-intl/server";
import { BookmarkButton } from "@/components/search/bookmark-button";
import { dayCountLabel, dayRange } from "@/components/sessions/day-label";
import { formatDate, formatNumber, formatTime, sameDay } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { SessionStatusBadge } from "@/components/ui/badge";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
import type { TimelineSession } from "@/lib/dal/search";

// One session as browse draws it — SCR-011's row card, rebuilt in wave 18 from
// `Browse.dc.html` (`M10a.md` §6, REQ-UIX-060, STORY-UIX-045).
//
// Three columns, in the artboard's order: the poster scaled whole at 4:5 · the
// badge, the title, «date · place», the lead presenter with the team ring and the
// seats line · the bookmark above the amount.
//
// ★ THE WHOLE ROW IS ONE LINK; the bookmark is a separate control in
// `CardActions`, which stops the press from opening the row (REQ-UIX-060).
//
// ★ THE STATUS COLOURS ARE DEC-073's (DEC-206 §4.62): the badge wears the
// primitive's tones, never the artboard's cyan waitlist or coral live fill.
//
// ★ THE AMOUNT IS THE RULE'S (§4.45) — «+20» where the org's `check_in` rule
// says 20 — and only on an open or live row: an ended or cancelled one pays
// nothing more, and a row never says «+0».
//
// ★ DATE AND PLACE ON ONE LINE (DEC-207, N5), joined with the public card's
// break rule: a no-break space after the «·», so the only break is before it and
// a venue's name wraps whole.
//
// No rating anywhere on a row (REQ-RAT-004). The ended wash is on the poster only
// (`CardMedia dimmed`, DEC-123): the badge is never dimmed.

export async function SessionRow({ session, locale, points, now = new Date() }: { session: TimelineSession; locale: string; points: number | null; now?: Date }) {
  const [t, tDays] = await Promise.all([getTranslations("browse"), getTranslations("sessions.days")]);
  const ended = session.phase === "ended" || session.phase === "cancelled";
  const lead = session.presenters[0];
  const others = Math.max(0, session.presenters.length - 1);
  const spans = session.days.length > 1;

  const when = !session.startsAt
    ? null
    : spans && session.endsAt
      ? dayRange(session.startsAt, session.endsAt, session.timeZone, tDays, locale)
      : session.phase === "ended"
        ? formatDate(session.startsAt, session.timeZone, locale)
        : sameDay(session.startsAt, now.toISOString(), session.timeZone)
          ? `${t("row.today")} ${formatTime(session.startsAt, session.timeZone, locale)}`
          : `${formatDate(session.startsAt, session.timeZone, locale)}، ${formatTime(session.startsAt, session.timeZone, locale)}`;

  // What matters for THIS viewer, said first: their seat, then the room's.
  const seatLine = (() => {
    if (session.mine === "confirmed" && !ended) return <span className="font-bold text-fg-heading">{t("card.mine.confirmed")}</span>;
    if (session.mine === "waitlisted" && !ended) return <span className="font-bold text-fg-heading">{t("card.mine.waitlisted")}</span>;
    if (session.phase === "ended" && session.attended) return <span className="font-bold text-fg-heading">{t("card.attended")}</span>;
    if (session.phase !== "open" || session.capacity === null) return null;
    if (session.seat === "full") return t("row.full", { count: session.waitlistCount, value: formatNumber(session.waitlistCount) });
    if (session.seat === "available") {
      return t.rich("row.seats", {
        taken: formatNumber(session.confirmedCount),
        capacity: session.capacity,
        capacityValue: formatNumber(session.capacity),
        bdi: (c) => <bdi>{c}</bdi>,
      });
    }
    return null;
  })();

  const shownPoints = points !== null && points > 0 && (session.phase === "open" || session.phase === "live") ? points : null;

  return (
    <Card density="compact" href={`/app/sessions/${session.id}`}>
      <CardMedia src={session.posterUrl} placeholderFrom={session.title} aspect="4/5" dimmed={ended} />
      <CardBody className="gap-1">
        <div>
          <SessionStatusBadge phase={session.phase} seat={session.phase === "open" ? session.seat : undefined} closingSoon={session.closingSoon} size="sm" />
        </div>
        <h3 className="text-body font-bold leading-snug text-fg-heading">
          <bdi>{session.title}</bdi>
        </h3>
        {when || session.venueName ? (
          <p className="text-caption text-fg-muted">
            {when ? <bdi>{when}</bdi> : null}
            {spans ? (
              <span className="whitespace-nowrap">
                {" · "}
                <bdi>{dayCountLabel(session.days.length, tDays)}</bdi>
              </span>
            ) : null}
            {when && session.venueName ? " · " : null}
            {session.venueName ? <bdi>{session.venueName}</bdi> : null}
          </p>
        ) : null}
        {lead || seatLine ? (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-fg-muted">
            {lead ? (
              <>
                <Avatar memberId={lead.memberId} displayName={lead.displayName} src={lead.avatarUrl ?? null} size={24} teamColor={lead.company?.teamColor ?? null} decorative />
                <span className="min-w-0">
                  <bdi>{lead.displayName ?? ""}</bdi>
                  {/* ★ A co-presented session is not credited to one person (the lead's ruling on
                      W18.11 item 1): the others in words — «وآخر» — never a second avatar. */}
                  {others > 0 ? <> {t("card.others", { count: others, value: formatNumber(others) })}</> : null}
                </span>
              </>
            ) : null}
            {lead && seatLine ? <span aria-hidden="true">·</span> : null}
            {seatLine ? <span>{seatLine}</span> : null}
          </p>
        ) : null}
      </CardBody>
      <CardActions className="flex-col justify-between self-stretch py-2.5 pe-2.5">
        <BookmarkButton locale={locale} sessionId={session.id} initialBookmarked={session.bookmarked} variant="icon" />
        {shownPoints !== null ? (
          <span className="text-caption text-fg-muted">
            <span aria-hidden="true" dir="ltr">
              +{formatNumber(shownPoints)}
            </span>
            <span className="sr-only">{t("row.points", { count: shownPoints, value: formatNumber(shownPoints) })}</span>
          </span>
        ) : null}
      </CardActions>
    </Card>
  );
}
