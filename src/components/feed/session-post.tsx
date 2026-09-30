import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import type { SessionPost as SessionPostData } from "@/components/browse/session-post";
import { dayHeading, daysBetween } from "@/components/feed/relative";
import { LikeButton } from "@/components/feed/like-button";
import { BookmarkButton } from "@/components/search/bookmark-button";
import { dayCountLabel } from "@/components/sessions/day-label";
import { formatNumber, formatTime } from "@/components/sessions/numerals";
import { publicCardPath, siteOrigin } from "@/components/sessions/public-card-metadata";
import { ShareLink } from "@/components/sessions/share-link";
import type { SessionCtaProps } from "@/components/ui";
import { Avatar, teamColorOrNull } from "@/components/ui/avatar";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { Poster } from "@/components/ui/poster";
import { SessionCta } from "@/components/ui/session-cta";
import { Sticker } from "@/components/ui/sticker";

// A session post on the home's feed — SCR-010, `Home.dc.html:45-93`, `HomeDesktop.dc.html:51-91`,
// REQ-UIX-055, DEC-206 §4.45 – §4.61, DEC-207 §2. Built from the artboard, not from the timeline's card.
//
// The regions, in the artboard's order: the presenter row (avatar in the team ring, name, company, place and
// time, the state) · the poster WHOLE, 4:5, never cropped (REQ-UIX-026 — the phone artboard's short box loses,
// DEC-207 §6.2) · the reactions row (the like, the comments, share, bookmark; an open post adds its seats) ·
// the action.
//
// On a wide card — the desktop column — the poster stands beside the copy, by a container query on the card
// (`card` `post` is a `@container`): 260 px for a live post, 160 px for any other, as the desktop artboard
// draws the two. The title is text there; on a phone it is on the poster, so the heading is visually hidden
// below that width and still the post's name for a screen reader.
//
// ★ A POST'S ACTION IS A LINK (§4.57): to the event page to reserve, to check-in to check in, to the rating
// to rate. A reservation is never made from the feed, where its moment cannot play.
// ★ EVERY FIGURE IS READ (contract 7): the amount is the org's rule, drawn only when `sessions'` DTO says so;
// the seats and the live count are the DTO's; no «+0» is drawn.
// ★ A member sees how many attend, never who (§4.56).
// ★ A cancelled post keeps its day, its badge and a dimmed poster, and offers nothing.

// ★ Every container-query class is written OUT, never built from a constant: Tailwind generates a class only
// when it finds its full name in the source. A variant prefix held in a constant and interpolated was never
// generated, so the poster fell to its min-content width — a 40 px strip — and the copy stayed visually hidden
// (the lead's 1280 capture, wave 18).
// `tests/unit/feed-classes.test.ts` refuses a variant built from an interpolation anywhere in the feed.

function presenterLine(post: SessionPostData) {
  const lead = post.presenters[0] ?? null;
  return lead;
}

export async function SessionPost({ post, locale, today, noCompany }: { post: SessionPostData; locale: string; today: string; noCompany: boolean }) {
  const [t, tDays, tEvent] = await Promise.all([getTranslations("feed"), getTranslations("sessions.days"), getTranslations("sessions.event")]);
  const lead = presenterLine(post);
  const live = post.phase === "live";
  const cancelled = post.phase === "cancelled";

  const time = post.startsAt ? formatTime(post.startsAt, post.timeZone, locale) : null;
  const place = post.venueName;
  const days = post.days.length > 1 ? dayCountLabel(post.days.length, tDays) : null;
  const when = [place && time ? t.rich("post.placeTime", { place, time, bdi: (c) => <bdi>{c}</bdi> }) : (place ?? time), days];

  const inDays = post.day ? daysBetween(today, post.day) : null;
  const badge =
    live || cancelled || post.seat === "full" || post.closingSoon ? (
      <SessionStatusBadge phase={post.phase} seat={post.seat} closingSoon={post.closingSoon} size="sm" />
    ) : inDays !== null && inDays >= 0 ? (
      <Badge size="sm">{t("post.inDays", { count: inDays, value: formatNumber(inDays) })}</Badge>
    ) : null;

  const points = post.attendancePoints !== null && post.attendancePoints > 0 ? t("post.points", { value: formatNumber(post.attendancePoints) }) : null;
  const seats =
    post.phase === "open" && post.capacity !== null
      ? t("post.seats", { count: post.capacity, value: formatNumber(post.capacity), taken: formatNumber(post.confirmedCount) })
      : null;
  const attendedNow = live && post.attendedCount !== null ? t("post.attendedLive", { count: post.attendedCount, value: formatNumber(post.attendedCount) }) : null;
  const shareUrl = cancelled ? null : `${siteOrigin()}${publicCardPath(locale, post.id)}`;
  const cta = cancelled ? null : action(post, t, points, noCompany);
  const company = lead?.company ?? null;
  const dot = company ? teamColorOrNull(company.teamColor) : null;

  return (
    <Card density="post">
      <div className="flex items-center gap-2.5">
        {lead ? (
          <Link href={`/app/members/${lead.memberId}`} quiet className="shrink-0 rounded-pill">
            <Avatar memberId={lead.memberId} displayName={lead.displayName} src={lead.avatarUrl} size={40} teamColor={company?.teamColor ?? null} />
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          {lead ? (
            <p className="flex flex-wrap items-center gap-x-1.5 text-label font-bold text-fg-heading">
              <bdi>{lead.displayName}</bdi>
              {company ? (
                // §4.61: the company in words, with its colour as a dot beside it — a colour from data is never
                // the text's own colour, whose contrast nobody measured.
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-fg-muted">
                  {dot ? <span aria-hidden className="size-2 rounded-pill bg-team" style={{ "--team": dot } as CSSProperties} /> : null}
                  <bdi>{company.name}</bdi>
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="flex flex-wrap gap-x-1.5 text-caption text-fg-muted">
            {when
              .filter(Boolean)
              .map((part, i) => (
                <span key={i}>
                  {i > 0 ? <span aria-hidden>· </span> : null}
                  {part}
                </span>
              ))}
          </p>
        </div>
        {badge}
      </div>

      <div className="flex flex-col gap-3 @min-[34rem]:flex-row @min-[34rem]:items-start">
        <Link href={post.href} quiet aria-label={t("post.posterName", { title: post.title })} className={`block rounded-tile @min-[34rem]:shrink-0 ${live ? "@min-[34rem]:w-[260px]" : "@min-[34rem]:w-40"}`}>
          <Poster
            src={post.posterUrl}
            title={post.title}
            category={post.categoryName ?? undefined}
            date={post.day && time ? t("post.posterDate", { day: dayHeading(post.day, today, t, locale), time }) : undefined}
            teamColor={company?.teamColor ?? null}
            // The placeholder names who, never by colour alone: the company, else the presenter.
            teamName={company?.name ?? lead?.displayName ?? ""}
            // §4.46: a rendered poster carries no sticker; the placeholder draws the rule's amount.
            sticker={!post.posterUrl && points ? <Sticker size="sm">{points}</Sticker> : undefined}
            className={cancelled ? "opacity-45 grayscale" : ""}
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="sr-only @min-[34rem]:not-sr-only font-display text-play-sm leading-[1.4] font-extrabold text-fg-heading">
            <Link href={post.href} quiet>
              <bdi>{post.title}</bdi>
            </Link>
          </h3>
          {post.excerpt ? (
            <p className="hidden text-body text-fg-muted @min-[34rem]:block">
              <bdi>{post.excerpt}</bdi>
            </p>
          ) : null}
          {attendedNow ? <p className="text-label font-bold text-fg-heading">{attendedNow}</p> : null}
        </div>
      </div>

      {cancelled ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <LikeButton locale={locale} sessionId={post.id} liked={post.likedByMe} count={post.likeCount} groupLabel={t("post.reactions")} likeLabel={t("post.like")} />
          <Link
            href={`${post.href}#discussion`}
            quiet
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-pill border border-edge bg-surface px-3 text-label font-bold text-fg-body hover:bg-hover"
            aria-label={t("post.comments", { count: post.commentCount, value: formatNumber(post.commentCount) })}
          >
            <CommentGlyph />
            {post.commentCount > 0 ? <bdi className="tabular-nums">{formatNumber(post.commentCount)}</bdi> : null}
          </Link>
          <span className="flex-1" />
          {seats ? <span className="text-caption text-fg-muted">{seats}</span> : null}
          {shareUrl ? (
            <ShareLink
              url={shareUrl}
              title={post.title}
              label={tEvent("actions.share")}
              copiedLabel={tEvent("shareCopied")}
              hint={tEvent("shareHint")}
              failedLabel={tEvent("shareFailed")}
              variant="icon"
              hintId="feed-share-hint"
            />
          ) : null}
          <BookmarkButton locale={locale} sessionId={post.id} initialBookmarked={post.bookmarked} variant="icon" />
        </div>
      )}

      {cta ? <SessionCta {...cta} /> : null}
    </Card>
  );
}

/** The house set has no speech-bubble glyph; the count's accessible name says what it is. */
function CommentGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden className="shrink-0 text-base">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;

/** The post's last row, from `sessions'` action — always a link. */
function action(post: SessionPostData, t: T, points: string | null, noCompany: boolean): SessionCtaProps | null {
  const a = post.action;
  // REQ-UIX-055: with no company set, a post's control states the reason instead of leading to a refusal.
  if (noCompany && (a.kind === "reserve" || a.kind === "waitlist")) return { state: { kind: "none", reason: t("post.action.noCompany") }, label: t("post.action.reserve") };
  switch (a.kind) {
    case "reserve":
      return { state: { kind: "reserve", act: { href: a.href } }, label: t("post.action.reserve"), chip: points ?? undefined };
    case "waitlist":
      return { state: { kind: "waitlist", act: { href: a.href } }, label: t("post.action.waitlist") };
    case "booked":
      return {
        state: { kind: "booked", hold: a.hold },
        label:
          a.hold === "seat"
            ? t("post.action.bookedSeat")
            : a.waitlistPosition !== null
              ? t("post.action.bookedWaitlistAt", { value: formatNumber(a.waitlistPosition) })
              : t("post.action.bookedWaitlist"),
      };
    case "checkIn":
      return { state: { kind: "checkIn", act: { href: a.href } }, label: t("post.action.checkIn"), chip: a.booked ? t("post.action.reserved") : undefined };
    case "attended":
      return { state: { kind: "attended" }, label: t("post.action.attended") };
    case "rate":
      return { state: { kind: "rate", act: { href: a.href } }, label: t("post.action.rate") };
    case "none":
      return null;
  }
}
