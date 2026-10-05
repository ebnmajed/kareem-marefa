"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Avatar, teamColorOrNull } from "@/components/ui/avatar";
import { formatDate, formatNumber, formatTime } from "@/components/sessions/numerals";
import type { StoryFrame, StorySession } from "@/lib/dal/stories";
import type { StoryMediaHrefs } from "@/lib/dal/story-frames";

// The frame bodies — what `ui/story-viewer` draws in its slot (`StoryLive`, `StoryPhoto`, `StoryRecap`,
// `StoryAttendee` .dc.html; REQ-STO-004, REQ-STO-013). `content`'s, rendered from `sessions'` DTO: every figure is
// read from it, never computed here, and nothing is filtered here (contract 4). Arabic first; every interpolated
// title, name and number in <bdi>; Western numerals (DEC-124).
//
// ★ THE GROUND (`StoryLive`, `StoryRecap`; `05-stories.md` «Poster frames use the team colour as the ground with ink
// text»). A generated frame stands on the session's TEAM COLOUR with INK text — `--team` set by the viewer on the
// frame's element, never a class per company and never a hex here — and on the raised ground with the scope's text
// when the session has no team colour. Ink on each of the seven passes AA (tests/unit/story-team-ground.test.ts). The
// viewer's own chrome — segments, header, controls — stays bone on its two scrims, as the boards draw it.
//
// ★ A CONTROL NEVER COVERS CONTENT: a text frame's body is inset 3.5 rem on both inline sides, clearing the viewer's two
// 44 px «السابق / التالي» discs at the edges, so the longest title wraps inside them.

type T = ReturnType<typeof useTranslations>;

/** «الآن» · «قبل 3 دقائق» · «قبل ساعتين» — a frame lives 24 hours, so nothing older is ever drawn. */
export function frameAge(t: T, at: string, now: string): string {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(at)) / 60_000));
  if (minutes < 1) return t("age.now");
  if (minutes < 60) return t("age.minutes", { count: minutes, value: formatNumber(minutes) });
  const hours = Math.min(23, Math.floor(minutes / 60));
  return t("age.hours", { count: hours, value: formatNumber(hours) });
}

/** «0:12» — a video's length, Western digits, minutes and two-digit seconds. */
export function videoLength(t: T, seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return t("frame.length", { m: formatNumber(Math.floor(s / 60)), ss: String(s % 60).padStart(2, "0") });
}

/** A frame's on-screen duration — STO-07: photo 5 s, a video its own length, text 6 s (§8.9 of content's plan). */
export function frameDurationMs(frame: StoryFrame, media: StoryMediaHrefs): number {
  if (frame.kind === "video") {
    const ms = media.videos[frame.id]?.durationMs ?? (frame.durationSeconds ? frame.durationSeconds * 1000 : null);
    return frame.state === "visible" && ms ? ms : 6000;
  }
  if (frame.kind === "photo") return 5000;
  return 6000;
}

/** The generated frames' ground — the team's colour with ink, or the neutral raised ground. */
function ground(session: StorySession): { frame: string; pill: string; tile: string } {
  return teamColorOrNull(session.teamColor)
    ? // ★ `text-h1/h2/h3` carry their own colour (`--fg-heading`, `globals.css`), so on the team's ground the heading
      // variable itself is re-pointed at the ink — the title and the large figures read ink as the board draws them,
      // and every `text-fg-heading` inside follows. Only this frame's subtree; the viewer's chrome keeps bone.
      { frame: "bg-team text-on-team [--fg-heading:var(--color-on-team)]", pill: "bg-on-team text-team", tile: "bg-on-team/10" }
    : { frame: "bg-raised text-fg-heading", pill: "bg-canvas text-fg-heading", tile: "bg-canvas/40" };
}

/** Clear of the viewer's two 44 px discs (0.5 rem gutter + 2.75 rem disc). */
const INSET = "px-14";

function Person({ person, line }: { person: { memberId: string; name: string | null; avatarUrl: string | null; teamColor: string | null } | null; line: string }) {
  return (
    <span className="flex items-center gap-2.5">
      {person ? <Avatar memberId={person.memberId} displayName={person.name} src={person.avatarUrl} size={32} teamColor={person.teamColor} decorative /> : null}
      <span className="text-body-sm font-bold">
        <bdi>{person?.name ?? ""}</bdi>
      </span>
      <span className="text-caption text-fg-muted">· {line}</span>
    </span>
  );
}

function TextFrame({ session, eyebrow, title, lines }: { session: StorySession; eyebrow: string; title: string; lines: string[] }) {
  const g = ground(session);
  return (
    <div className={`flex h-full flex-col justify-center gap-3.5 ${INSET} pt-20 ${g.frame}`}>
      <span className={`self-start rounded-pill px-3.5 py-1.5 text-label font-bold ${g.pill}`}>{eyebrow}</span>
      <h2 className="font-display text-h2 font-extrabold leading-snug">
        <bdi>{title}</bdi>
      </h2>
      {lines.map((line) => (
        <p key={line} className="text-body font-bold">
          <bdi>{line}</bdi>
        </p>
      ))}
    </div>
  );
}

export function FrameBody({
  frame,
  session,
  media,
  now,
  locale,
  videoRef,
}: {
  frame: StoryFrame;
  session: StorySession;
  media: StoryMediaHrefs;
  now: string;
  locale: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const t = useTranslations("stories");
  const tz = session.timeZone;
  const g = ground(session);
  const day = frame.dayPosition ? t("frame.day", { position: formatNumber(frame.dayPosition) }) : null;
  const when = (iso: string | null) => (iso ? `${formatDate(iso, tz, locale)} · ${formatTime(iso, tz, locale)}` : null);

  switch (frame.kind) {
    case "published":
      return (
        <div className={`relative h-full ${g.frame}`}>
          {frame.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed URL; the poster whole, never cropped (REQ-UIX-026)
            <img src={frame.posterUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          <div className={`relative flex h-full flex-col justify-end gap-2.5 ${INSET} pb-32`}>
            <span className={`self-start rounded-pill px-3.5 py-1.5 text-label font-bold ${g.pill}`}>{t("frame.published")}</span>
            <h2 className="font-display text-h2 font-extrabold leading-snug">
              <bdi>{session.title}</bdi>
            </h2>
            {[when(frame.startsAt), frame.venueName].filter(Boolean).map((line) => (
              <p key={line} className="text-body font-bold">
                <bdi>{line}</bdi>
              </p>
            ))}
          </div>
        </div>
      );
    case "registration_opened":
      return <TextFrame session={session} eyebrow={t("frame.registrationOpened")} title={session.title} lines={[when(frame.startsAt)].filter(Boolean) as string[]} />;
    case "registration_closed":
      return <TextFrame session={session} eyebrow={t("frame.registrationClosed")} title={session.title} lines={[when(frame.startsAt)].filter(Boolean) as string[]} />;
    case "starts_soon":
      return <TextFrame session={session} eyebrow={day ?? t("frame.startsSoon")} title={session.title} lines={[when(frame.startsAt), frame.venueName].filter(Boolean) as string[]} />;
    case "materials":
      return (
        <TextFrame
          session={session}
          eyebrow={t("frame.materials")}
          title={session.title}
          lines={[`${formatNumber(frame.materialsCount)} ${t("frame.materialsStat", { count: frame.materialsCount })}`]}
        />
      );
    case "live": {
      // `StoryLive.dc.html`: everything CENTRED, both ways — the badge (ink, coral word and dot), the title, the count's
      // NUMERAL large with «في القاعة» small beside it, the venue and the end. The whole phrase is the accessible text.
      const count = frame.checkedInCount;
      return (
        <div className={`flex h-full flex-col items-center justify-center gap-4 ${INSET} text-center ${g.frame}`}>
          <span className="inline-flex items-center gap-2 rounded-pill bg-on-team px-3.5 py-1.5 text-label font-bold text-signal">
            <span aria-hidden className="size-2 rounded-pill bg-signal" />
            {t("frame.live")}
            {day ? <bdi>· {day}</bdi> : null}
          </span>
          <h2 className="font-display text-h1 font-extrabold leading-tight">
            <bdi>{session.title}</bdi>
          </h2>
          {count !== null ? (
            <p className="flex items-baseline gap-2">
              <span className="sr-only">{t("frame.liveCount", { count, value: formatNumber(count) })}</span>
              <bdi aria-hidden className="font-display text-[4rem] font-extrabold leading-none tabular-nums">
                {formatNumber(count)}
              </bdi>
              <span aria-hidden className="text-body font-bold">
                {t("frame.inRoom")}
              </span>
            </p>
          ) : null}
          <p className="text-body-sm font-bold">
            <bdi>{[frame.venueName, t("frame.until", { time: formatTime(frame.endsAt, tz, locale) })].filter(Boolean).join(" · ")}</bdi>
          </p>
        </div>
      );
    }
    case "photo": {
      const url = media.photos[frame.photoId];
      return (
        <div className="relative h-full bg-void">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed URL; never cropped (REQ-UIX-026)
            <img src={url} alt={frame.caption ?? ""} className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          <div className="absolute inset-x-4 bottom-24 flex flex-col gap-2">
            <Person person={frame.uploader} line={frameAge(t, frame.triggeredAt, now)} />
            {frame.caption ? (
              <p className="text-body font-bold">
                <bdi>{frame.caption}</bdi>
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    case "video": {
      const hrefs = media.videos[frame.id];
      const length = hrefs?.durationMs ? hrefs.durationMs / 1000 : frame.durationSeconds;
      if (frame.state !== "visible" || !hrefs) {
        return (
          <div className={`flex h-full flex-col items-center justify-center gap-3 ${INSET} text-center ${g.frame}`}>
            <p role="status" className="font-display text-h3 font-extrabold">
              {frame.state === "failed" ? t("frame.failed") : t("frame.processing")}
            </p>
          </div>
        );
      }
      return (
        <div className="relative h-full bg-void">
          <video ref={videoRef} src={hrefs.videoUrl} poster={hrefs.posterUrl} playsInline preload="auto" className="absolute inset-0 h-full w-full object-contain" />
          {length ? (
            // The length pill at the inline-end as `StoryAttendee` draws it — below the viewer's two header rows, never under them.
            <span className="absolute end-4 top-40 rounded-pill bg-chrome px-2.5 py-1 text-caption font-bold">
              <bdi dir="ltr">{videoLength(t, length)}</bdi>
            </span>
          ) : null}
          <div className="absolute inset-x-4 bottom-24 flex flex-col gap-2">
            <Person person={frame.author} line={frameAge(t, frame.triggeredAt, now)} />
            {frame.caption ? (
              <p className="text-body font-bold">
                <bdi>{frame.caption}</bdi>
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    case "recap": {
      // `StoryRecap.dc.html`: start-aligned on the team ground — «اكتملت» in an ink pill with the team's word, the title,
      // the three stats on ink-tinted tiles, the photo strip.
      const rating =
        frame.rating === null
          ? "—"
          : frame.rating.state === "shown"
            ? formatNumber(Math.round(frame.rating.average * 10) / 10)
            : t("frame.ratingWithheld", { minimum: formatNumber(frame.rating.minimum) });
      const stats: [string, string][] = [
        [frame.attended === null ? "—" : formatNumber(frame.attended), t("frame.attended")],
        [rating, t("frame.rating")],
        [formatNumber(frame.materialsCount), t("frame.materialsStat", { count: frame.materialsCount })],
      ];
      const photos = frame.photoIds.map((id) => media.photos[id]).filter(Boolean);
      return (
        <div className={`flex h-full flex-col justify-center gap-3.5 ${INSET} pt-20 ${g.frame}`}>
          <span className={`self-start rounded-pill px-3.5 py-1.5 text-label font-bold ${g.pill}`}>{t("frame.recap")}</span>
          <h2 className="font-display text-h2 font-extrabold leading-tight">
            <bdi>{session.title}</bdi>
          </h2>
          <dl className="grid grid-cols-3 gap-2">
            {stats.map(([value, label]) => (
              <div key={label} className={`flex flex-col gap-0.5 rounded-tile p-3 ${g.tile}`}>
                <dd className="order-1 font-display text-h3 font-extrabold leading-none">
                  <bdi>{value}</bdi>
                </dd>
                <dt className="order-2 text-caption font-bold">{label}</dt>
              </div>
            ))}
          </dl>
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed URLs; the strip's crop is deliberate
                <img key={url} src={url} alt="" className="aspect-square w-full rounded-field object-cover" />
              ))}
            </div>
          ) : null}
        </div>
      );
    }
  }
}
