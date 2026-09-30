import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getSessionPoster } from "@/lib/dal/posters";
import type { SessionPhase } from "@/lib/session-status";
import { formatTime } from "@/components/sessions/numerals";
import { SessionStatusBadge } from "@/components/ui/badge";
import { Poster } from "@/components/ui/poster";

// SCR-014's session mini-row (`CheckIn.dc.html`, REQ-UIX-062): which session this code is for,
// where, and when it began — so a member in the wrong room finds out before typing.
//
// ★ The start as a TIME, never «بدأت قبل 12 دقيقة» (DEC-209, D2): this screen does not re-render
// while a member types, and a relative time would be wrong by the time they read it.
// ★ The status pill wears the primitive's `DEC-073` tone, never the artboard's coral fill (§4.62),
// and only while live — the one phase this screen is for.

const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

/** The rendered poster, whole, as a thumb — or nothing. Decoration: it streams, and a failed read draws nothing. */
async function Thumb({ locale, sessionId, title }: { locale: string; sessionId: string; title: string }) {
  const poster = await getSessionPoster(locale, sessionId).catch(() => null);
  if (!poster?.imageUrl) return null;
  return (
    <span aria-hidden="true" className="w-11 shrink-0">
      <Poster src={poster.imageUrl} width={poster.width ?? undefined} height={poster.height ?? undefined} title={title} teamColor={null} teamName="" />
    </span>
  );
}

export async function CheckInSessionRow({
  locale,
  sessionId,
  title,
  phase,
  venueName,
  startsAt,
  timeZone,
}: {
  locale: string;
  sessionId: string;
  title: string;
  phase: SessionPhase;
  venueName: string | null;
  startsAt: string | null;
  timeZone: string;
}) {
  const t = await getTranslations("checkin.row");
  // «بدأت» once the meeting has begun, from the phase the DAL computed on one instant — never a clock read here.
  const started = phase === "live" || phase === "ended";
  const when = startsAt ? t.rich(started ? "startedAt" : "startsAt", { time: formatTime(startsAt, timeZone, locale), bdi }) : null;

  return (
    <div className="flex items-center gap-2.5 rounded-panel border border-edge bg-surface p-2.5">
      <Suspense fallback={null}>
        <Thumb locale={locale} sessionId={sessionId} title={title} />
      </Suspense>
      <p className="min-w-0 flex-1 leading-snug">
        <span className="block text-body-sm font-bold text-fg-heading">
          <bdi>{title}</bdi>
        </span>
        {venueName || when ? (
          <span className="block text-caption text-fg-muted">
            {venueName ? <bdi>{venueName}</bdi> : null}
            {venueName && when ? " · " : null}
            {when}
          </span>
        ) : null}
      </p>
      {phase === "live" ? <SessionStatusBadge phase="live" size="sm" className="shrink-0" /> : null}
    </div>
  );
}
