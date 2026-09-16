import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SessionStatusBadge } from "@/components/ui/badge";
import { TagChip } from "@/components/ui/tag-chip";
import { AvatarStack } from "@/components/ui/avatar";
import { formatNumber } from "@/components/sessions/numerals";
import type { EventSession } from "@/lib/dal/sessions";
import type { SeatState, SessionPhase } from "@/lib/session-status";

// The event page's hero — `16` §4.2.2, §6.3, REQ-SES-011, REQ-SES-013,
// REQ-UIX-003, DEC-080.
//
// ONE dark band per screen, at the top, where the session's identity lives: the
// status badge ABOVE the title (state seen before it is read, `16` §3
// principle 3), the title as the page's one `<h1>`, who presents it, and the
// chips — category, level, **language**, duration. The language chip is here
// and not further down because REQ-SES-011 wants it before the reservation
// action, and the action card follows this band at every width.
//
// ★ Phone and desktop differ in one thing, the lead's ruling on §25 Q3: from
// `md` the poster sits in the band's second column; on the phone the band is a
// dark gradient carrying the badge, the title, the presenters and the chips,
// and the full poster opens «نبذة» instead — a 4:5 poster above the card would
// push the one primary action out of the first screen. The gradient is page
// styling over the existing navy tokens, not a poster fill (DEC-127 is not this
// wave).
//
// ★ The poster is exactly as wide as its column (`DEC-122`: the canvas's
// overspill is a missing `box-sizing` reset in the mockup), and an ended
// session's wash is on the IMAGE only — nothing here dims the badge (`DEC-123`).

export interface EventHeroProps {
  session: EventSession;
  phase: SessionPhase;
  seat: SeatState | undefined;
  closingSoon: boolean;
  /** `SessionPoster` for the band's second column — rendered by the page, shown from `md`. */
  poster: ReactNode;
  locale: string;
}

export async function EventHero({ session, phase, seat, closingSoon, poster, locale }: EventHeroProps) {
  const [t, tUi] = await Promise.all([getTranslations("sessions.event"), getTranslations("ui.pageHeader")]);

  const breadcrumb = [{ href: "/app/sessions", label: t("breadcrumbRoot") }];
  if (session.categoryId && session.categoryName) {
    breadcrumb.push({ href: `/app/sessions?category=${session.categoryId}`, label: session.categoryName });
  }

  const chips: string[] = [
    ...(session.categoryName ? [session.categoryName] : []),
    t(`level.${session.level}`),
    session.language === "ar" ? t("languageAr") : t("languageEn"),
    ...(session.durationMinutes ? [t("duration", { count: session.durationMinutes, value: formatNumber(session.durationMinutes) })] : []),
  ];

  return (
    <div className="theme-dark bg-[linear-gradient(140deg,var(--color-navy-950),var(--color-navy-800))] md:bg-none">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-8 pt-5 md:grid-cols-[minmax(0,1fr)_372px] md:items-start md:gap-12 md:px-8 md:pb-16 md:pt-6">
        <div className="flex min-w-0 flex-col gap-5">
          <PageHeader
            breadcrumb={breadcrumb}
            breadcrumbLabel={tUi("breadcrumb")}
            status={<SessionStatusBadge phase={phase} seat={seat} closingSoon={closingSoon} />}
            title={session.title}
            meta={chips.map((label) => (
              <TagChip key={label} label={label} />
            ))}
          />
          {session.presenters.length > 0 ? <Presenters session={session} locale={locale} label={phase === "ended" ? t("presentedByPast") : t("presentedBy")} fallback={t("presenterFallback")} /> : null}
        </div>
        <div className={`hidden min-w-0 md:block ${phase === "ended" || phase === "cancelled" ? "[&_img]:opacity-50 [&_img]:grayscale" : ""}`}>{poster}</div>
      </div>
    </div>
  );
}

/**
 * «يقدّمها سعد الحربي ونورة القحطاني». Every name is its own `<bdi>` — a Latin
 * name inside the Arabic run must not reorder the conjunction around it — and
 * the conjunction comes from `Intl.ListFormat`, so three presenters read as
 * Arabic lists do, not as «و» typed between each pair.
 */
function Presenters({ session, locale, label, fallback }: { session: EventSession; locale: string; label: string; fallback: string }) {
  const names = session.presenters.map((p) => p.displayName ?? fallback);
  const parts = new Intl.ListFormat(locale, { type: "conjunction" }).formatToParts(names);
  return (
    <div className="flex items-center gap-3">
      <AvatarStack size={32} max={3} members={session.presenters.map((p) => ({ memberId: p.memberId, displayName: p.displayName }))} />
      <p className="min-w-0 text-body text-fg-body">
        {label}{" "}
        {parts.map((part, i) =>
          part.type === "element" ? (
            <bdi key={i} className="font-medium text-fg-heading">
              {part.value}
            </bdi>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </p>
    </div>
  );
}
