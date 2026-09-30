import { getTranslations } from "next-intl/server";
import { dayCountLabel } from "@/components/sessions/day-label";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { SessionStatusBadge } from "@/components/ui/badge";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Poster } from "@/components/ui/poster";
import { Prose } from "@/components/ui/prose";
import { Sticker } from "@/components/ui/sticker";
import { TagChip } from "@/components/ui/tag-chip";
import { getSessionPoster } from "@/lib/dal/posters";
import type { EventSession } from "@/lib/dal/sessions";
import type { SeatState, SessionPhase } from "@/lib/session-status";

// The event page's hero — rebuilt in wave 18 from `Event.dc.html` and `EventDesktop.dc.html` (REQ-UIX-061,
// ruling 4 of DEC-205). In the artboards' order: the poster, WHOLE at 4:5 · the chips — the phase, the level,
// ★ the language (REQ-SES-011: before the action, at every width) and the length · the `h1` · the presenter
// card · and from `lg`, beside the poster, the abstract and the tags (the phone reads them in «نبذة»).
//
// ★ THE POSTER IS THE ARTIFACT WHOLE, NEVER CROPPED (REQ-UIX-026). A render at its own size; before one exists,
// `ui/poster`'s typographic placeholder in the lead presenter's team colour, with the rule's amount as its
// sticker for a member — the «+50» belongs to the poster template, so a RENDERED poster carries none of its
// own (DEC-206 §4.46). The ended wash is on the poster alone, never the badge (DEC-123).
//
// ★ THE LENGTH: «60 دقيقة» at one day, «3 أيام» at several — the column is day one's length (DEC-151 §4), and
// «120 دقيقة» on a three-evening workshop would read as «this takes two hours» (REQ-SES-015).
//
// Presenters: a card per presenter — the ring in the company's colour, the name, the title and the company,
// «الملف» — linking to their profile. No rating and no computed history (§25 Q5, DEC-206 §4.67).

export interface EventHeroProps {
  session: EventSession;
  phase: SessionPhase;
  seat: SeatState | undefined;
  closingSoon: boolean;
  dayCount: number;
  /** The rule's amount for this viewer — the placeholder's sticker. Null draws none. */
  points: number | null;
  locale: string;
}

export async function EventHero({ session, phase, seat, closingSoon, dayCount, points, locale }: EventHeroProps) {
  const [t, tDays, tPoster, poster] = await Promise.all([
    getTranslations("sessions.event"),
    getTranslations("sessions.days"),
    getTranslations("designer.poster"),
    getSessionPoster(locale, session.id).catch(() => null),
  ]);
  const lead = session.presenters[0];
  const washed = phase === "ended" || phase === "cancelled";
  const length =
    dayCount > 1
      ? dayCountLabel(dayCount, tDays)
      : session.durationMinutes
        ? t("duration", { count: session.durationMinutes, value: formatNumber(session.durationMinutes) })
        : null;

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="flex flex-col gap-2">
        <div className={washed ? "grayscale opacity-45" : undefined}>
          <Poster
            src={poster?.imageUrl ?? null}
            width={poster?.width ?? undefined}
            height={poster?.height ?? undefined}
            title={session.title}
            category={session.categoryName ?? undefined}
            date={session.startsAt ? formatDate(session.startsAt, session.timeZone, locale) : undefined}
            teamColor={lead?.teamColor ?? null}
            teamName={lead?.companyName ?? lead?.displayName ?? t("presenterFallback")}
            sticker={!poster?.imageUrl && points !== null && points > 0 ? <Sticker rotate={6}>{t("pointsChip", { value: formatNumber(points) })}</Sticker> : undefined}
            priority
          />
        </div>
        {/* Staff learn when details moved under a detached poster (DEC-012) — said once, quietly. */}
        {session.viewerIsStaff && poster?.staleSince ? (
          <p role="status" className="text-body-sm text-fg-heading">
            {tPoster("stale")}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <PageHeader
          className="gap-3"
          title={session.title}
          status={
            <>
              <SessionStatusBadge phase={phase} seat={seat} closingSoon={closingSoon} />
              <TagChip label={t(`level.${session.level}`)} />
              <TagChip label={session.language === "ar" ? t("languageAr") : t("languageEn")} />
              {length ? <TagChip label={length} /> : null}
            </>
          }
        />

        {/* From `lg` the abstract and the tags stand in the band (`EventDesktop.dc.html`); the phone reads them in «نبذة». */}
        <Prose className="hidden lg:block">
          <p className="whitespace-pre-line">
            <bdi>{session.abstract}</bdi>
          </p>
        </Prose>

        {session.presenters.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {session.presenters.map((p) => {
              const role = [p.jobTitle, p.companyName].filter((v): v is string => Boolean(v));
              return (
                <li key={p.memberId}>
                  <Link
                    href={`/app/members/${p.memberId}`}
                    quiet
                    className="flex items-center gap-3 rounded-panel border border-edge bg-surface p-3 text-fg-heading no-underline"
                  >
                    <Avatar memberId={p.memberId} displayName={p.displayName} src={p.avatarUrl ?? null} size={40} teamColor={p.teamColor ?? null} decorative />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-bold">
                        <bdi>{p.displayName ?? t("presenterFallback")}</bdi>
                      </span>
                      {role.length > 0 ? (
                        <span className="text-caption text-fg-muted">
                          {role.map((part, i) => (
                            <span key={i}>
                              {i > 0 ? "، " : null}
                              <bdi>{part}</bdi>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-caption text-fg-muted">{t("profileLink")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {session.tags.length > 0 ? (
          <ul aria-label={t("tagsLabel")} className="hidden flex-wrap gap-1.5 lg:flex">
            {session.tags.map((tag) => (
              <li key={tag.normalised}>
                <TagChip label={`#${tag.label}`} href={`/app/sessions?tag=${encodeURIComponent(tag.normalised)}`} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
