import { getTranslations } from "next-intl/server";
import { BookmarkButton } from "@/components/search/bookmark-button";
import { formatDate, formatNumber, formatTime } from "@/components/sessions/numerals";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { Card, CardActions, CardBody, CardMedia } from "@/components/ui/card";
import { TagChip } from "@/components/ui/tag-chip";
import type { TimelineSession } from "@/lib/dal/search";

// One session on the timeline — `16` §6.4, REQ-UIX-003, REQ-UIX-021, DEC-112.
//
// Generous and scannable, one column: the poster at 4:5 beside the text (a 16:9
// crop would cut a designed poster's typography), the status badge first so
// state reads while scrolling, then the title, who presents it, when and where,
// the level and up to three tags, and a footer saying what matters for THIS
// viewer — their seat, the seats left, the waitlist, «حضرت».
//
// ★ The status badge is in the body, not over the poster. The media column is
// ~112 px on a phone and the media box clips its overlay, so «يُغلق التسجيل
// قريبًا» would have been cut mid-word — a clipped Arabic line (`10` §1).
//
// ★ The ended/cancelled wash is on the image only (`CardMedia dimmed`,
// DEC-123): the badge is never dimmed.
//
// ★ No rating anywhere on a card (REQ-RAT-004, `16` §2.2, DEC-114 class 2).
//
// The whole card is one link; the bookmark is a nested control in
// `CardActions`, which stops the click from navigating. Tags on the card are
// static text for the same reason — a link inside the card's link would nest
// anchors. They are links on the event page.

export async function SessionCard({ session, locale, pinned = false }: { session: TimelineSession; locale: string; pinned?: boolean }) {
  const t = await getTranslations("browse");
  const ended = session.phase === "ended" || session.phase === "cancelled";
  const lead = session.presenters[0];

  const when = session.startsAt
    ? session.phase === "ended"
      ? formatDate(session.startsAt, session.timeZone, locale)
      : // A no-break space AFTER the dot, so a break can come before it and never
        // leave «·» alone at the end of a line.
        `${formatDate(session.startsAt, session.timeZone, locale)} ·\u00A0${formatTime(session.startsAt, session.timeZone, locale)}`
    : null;

  const footer = (() => {
    if (session.mine === "confirmed" && !ended) return <Badge tone="success" size="sm">{t("card.mine.confirmed")}</Badge>;
    if (session.mine === "waitlisted" && !ended) return <Badge tone="live" size="sm">{t("card.mine.waitlisted")}</Badge>;
    if (session.phase === "ended" && session.attended) return <Badge tone="success" size="sm">{t("card.attended")}</Badge>;
    if (session.phase === "open" && session.capacity !== null) {
      if (session.seat === "full") {
        return <span className="text-body-sm text-fg-muted">{t("card.waitlist", { count: session.waitlistCount, value: formatNumber(session.waitlistCount) })}</span>;
      }
      if (session.seat === "available") {
        const left = Math.max(0, session.capacity - session.confirmedCount);
        return <span className="text-body-sm text-fg-muted">{t("card.seatsLeft", { count: left, value: formatNumber(left) })}</span>;
      }
    }
    return null;
  })();

  return (
    <Card density={pinned ? "wide" : "row"} href={`/app/sessions/${session.id}`}>
      <CardMedia src={session.posterUrl} placeholderFrom={session.title} aspect="4/5" dimmed={ended} />
      <CardBody>
        <div className="flex flex-wrap items-center gap-2">
          {pinned ? <span className="text-label text-fg-heading">{t("timeline.pinned")}</span> : null}
          <SessionStatusBadge phase={session.phase} seat={session.phase === "open" ? session.seat : undefined} closingSoon={session.closingSoon} size="sm" />
        </div>
        <h3 className="text-h3 text-fg-heading">
          <bdi>{session.title}</bdi>
        </h3>
        {lead ? (
          <p className="flex items-center gap-2 text-body-sm text-fg-muted">
            <AvatarStack size={24} max={2} members={session.presenters.map((p) => ({ memberId: p.memberId, displayName: p.displayName }))} />
            <span className="min-w-0">
              <bdi>{lead.displayName ?? ""}</bdi>
              {session.presenters.length > 1 ? (
                <> {t("card.others", { count: session.presenters.length - 1, value: formatNumber(session.presenters.length - 1) })}</>
              ) : null}
            </span>
          </p>
        ) : null}
        {/* When, then where, each on its own line: joined, a narrow card broke
            the venue's name in two («قاعة» / «التصفّح») and left a «·» at a line end. */}
        {when ? (
          <p className="text-body-sm text-fg-body">
            <bdi>{when}</bdi>
          </p>
        ) : null}
        {session.venueName ? (
          <p className="text-body-sm text-fg-muted">
            <bdi>{session.venueName}</bdi>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <TagChip label={t(`card.level.${session.level}`)} />
          {session.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag.normalised} label={tag.label} />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-edge pt-2.5">
          <div className="min-w-0">{footer}</div>
          <CardActions>
            <BookmarkButton locale={locale} sessionId={session.id} initialBookmarked={session.bookmarked} variant="icon" />
          </CardActions>
        </div>
      </CardBody>
    </Card>
  );
}
