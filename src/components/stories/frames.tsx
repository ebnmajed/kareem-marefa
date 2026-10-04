"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatNumber, formatTime } from "@/components/sessions/numerals";
import type { StoryFrame, StorySession } from "@/lib/dal/stories";
import type { StoryMediaHrefs } from "@/lib/dal/story-frames";

// The frame bodies — what `ui/story-viewer` draws in its slot (`StoryLive`, `StoryPhoto`, `StoryRecap`,
// `StoryAttendee` .dc.html; REQ-STO-004, REQ-STO-013). `content`'s, rendered from `sessions'` DTO: every figure is
// read from it, never computed here, and nothing is filtered here (contract 4). Arabic first; every interpolated
// title, name and number in <bdi>; Western numerals (DEC-124).

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

const SHADE_TOP = "pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-void/60 to-transparent";
const SHADE_BOTTOM = "pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-void/70 to-transparent";

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

function TextFrame({ eyebrow, title, lines, team }: { eyebrow: string; title: string; lines: string[]; team?: boolean }) {
  return (
    <div className={`flex h-full flex-col justify-center gap-3 px-6 ${team ? "bg-team text-on-team" : "bg-canvas"}`}>
      <span className="self-start rounded-pill bg-chrome px-3 py-1 text-label font-bold text-fg-heading">{eyebrow}</span>
      <h2 className="font-display text-h2 font-extrabold leading-snug">
        <bdi>{title}</bdi>
      </h2>
      {lines.map((line) => (
        <p key={line} className="text-body">
          {line}
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
  const day = frame.dayPosition ? t("frame.day", { position: formatNumber(frame.dayPosition) }) : null;
  const when = (iso: string | null) => (iso ? `${formatDate(iso, tz, locale)} · ${formatTime(iso, tz, locale)}` : null);

  switch (frame.kind) {
    case "published":
      return (
        <div className="relative h-full bg-team text-on-team">
          {frame.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed URL, never optimisable
            <img src={frame.posterUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          <div className="relative flex h-full flex-col justify-end gap-2 px-6 pb-32">
            <span className="self-start rounded-pill bg-chrome px-3 py-1 text-label font-bold text-fg-heading">{t("frame.published")}</span>
            <h2 className="font-display text-h2 font-extrabold leading-snug">
              <bdi>{session.title}</bdi>
            </h2>
            {[when(frame.startsAt), frame.venueName].filter(Boolean).map((line) => (
              <p key={line} className="text-body">
                <bdi>{line}</bdi>
              </p>
            ))}
          </div>
        </div>
      );
    case "registration_opened":
      return <TextFrame eyebrow={t("frame.registrationOpened")} title={session.title} lines={[when(frame.startsAt)].filter(Boolean) as string[]} />;
    case "registration_closed":
      return <TextFrame eyebrow={t("frame.registrationClosed")} title={session.title} lines={[when(frame.startsAt)].filter(Boolean) as string[]} />;
    case "starts_soon":
      return <TextFrame eyebrow={day ?? t("frame.startsSoon")} title={session.title} lines={[when(frame.startsAt), frame.venueName].filter(Boolean) as string[]} team />;
    case "materials":
      return (
        <TextFrame
          eyebrow={t("frame.materials")}
          title={session.title}
          lines={[`${formatNumber(frame.materialsCount)} ${t("frame.materialsStat", { count: frame.materialsCount })}`]}
        />
      );
    case "live":
      return (
        <div className="flex h-full flex-col justify-center gap-3 bg-canvas px-6">
          <span className="inline-flex items-center gap-2 self-start rounded-pill border-2 border-signal px-3 py-1 text-label font-bold">
            <span aria-hidden className="size-2 rounded-pill bg-signal" />
            {t("frame.live")}
            {day ? <bdi>· {day}</bdi> : null}
          </span>
          <h2 className="font-display text-h2 font-extrabold leading-snug">
            <bdi>{session.title}</bdi>
          </h2>
          {frame.checkedInCount !== null ? (
            <p className="font-display text-h1 font-extrabold">{t("frame.liveCount", { count: frame.checkedInCount, value: formatNumber(frame.checkedInCount) })}</p>
          ) : null}
          <p className="text-body text-fg-muted">
            {[frame.venueName, t("frame.until", { time: formatTime(frame.endsAt, tz, locale) })].filter(Boolean).join(" · ")}
          </p>
        </div>
      );
    case "photo": {
      const url = media.photos[frame.photoId];
      return (
        <div className="relative h-full bg-void">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed URL; never cropped (REQ-UIX-026)
            <img src={url} alt={frame.caption ?? ""} className="absolute inset-0 h-full w-full object-contain" />
          ) : null}
          <div className={SHADE_TOP} />
          <div className={SHADE_BOTTOM} />
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
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
            <p role="status" className="font-display text-h3 font-extrabold">
              {frame.state === "failed" ? t("frame.failed") : t("frame.processing")}
            </p>
          </div>
        );
      }
      return (
        <div className="relative h-full bg-void">
          <video
            ref={videoRef}
            src={hrefs.videoUrl}
            poster={hrefs.posterUrl}
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-contain"
          />
          <div className={SHADE_TOP} />
          <div className={SHADE_BOTTOM} />
          {length ? (
            <span className="absolute end-4 top-24 rounded-pill bg-chrome px-2.5 py-1 text-caption font-bold">
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
        <div className="flex h-full flex-col justify-center gap-4 bg-canvas px-6">
          <span className="self-start rounded-pill bg-accent px-3 py-1 text-label font-bold text-on-accent">{t("frame.recap")}</span>
          <h2 className="font-display text-h2 font-extrabold leading-snug">
            <bdi>{session.title}</bdi>
          </h2>
          <dl className="grid grid-cols-3 gap-2">
            {stats.map(([value, label]) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-tile bg-surface px-3 py-2.5">
                <dd className="order-1 font-display text-h3 font-extrabold">
                  <bdi>{value}</bdi>
                </dd>
                <dt className="order-2 text-caption text-fg-muted">{label}</dt>
              </div>
            ))}
          </dl>
          {photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- signed URLs
                <img key={url} src={url} alt="" className="aspect-square w-full rounded-tile object-cover" />
              ))}
            </div>
          ) : null}
        </div>
      );
    }
  }
}

