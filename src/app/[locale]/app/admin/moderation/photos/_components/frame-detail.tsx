import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { FrameForModeration, PhotoStatus } from "@/lib/dal/admin-moderation";
import { removeFrame, restoreFrame } from "../actions";
import { Decide } from "./decide";
import { Pair, Who } from "./photo-detail";

// SCR-051's detail for a STORY FRAME — wave 26, REQ-STO-015, REQ-STO-014. The same order as a photo's: the media large;
// الجلسة · نشرها · طلب الإخفاء or المُبلِّغ · الحالة; the decision. ★ A video PLAYS here (`controls`, never autoplay —
// the console does not move, REQ-UIX-053). A reported frame is already hidden (one report hides it, DEC-251 §4.8), so
// the other decision is always «أعدها للعرض»: it clears the frame's hide and closes what is open on it.

const TONE: Record<PhotoStatus, Tone> = { hidden: "info", visible: "neutral", removed: "ended" };

export async function FrameDetail({ locale, frame }: { locale: string; frame: FrameForModeration }) {
  const t = await getTranslations("photos.moderation");
  const age = (days: number) => t("age", { count: days, value: formatNumber(days) });
  const bound = locale as Locale;
  const deciding = frame.status !== "removed" && (frame.requests.length > 0 || frame.reports.length > 0);
  const name = t.markup("imageAlt", { session: frame.sessionTitle, bdi: (chunks) => chunks });

  return (
    <article className="space-y-4">
      <h2 id="photo-title" className="sr-only">
        {name}
      </h2>
      {/* A video frame is ALWAYS its player, even when its rendition cannot be signed (an object gone from Storage): a
          moderator sees there is a video to decide on, and its controls, never a blank tile. */}
      {frame.kind === "video" ? (
        <video src={frame.videoUrl || undefined} poster={frame.posterUrl || undefined} controls playsInline preload="metadata" aria-label={name} className="max-h-[28rem] w-full rounded-tile bg-raised object-contain" />
      ) : frame.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived preview
        <img src={frame.imageUrl} alt={name} className="max-h-[28rem] w-full rounded-tile bg-raised object-contain" />
      ) : (
        <div aria-hidden="true" className="aspect-[4/3] w-full rounded-tile bg-raised" />
      )}
      {frame.caption ? (
        <p className="text-body text-fg-heading">
          <bdi>{frame.caption}</bdi>
        </p>
      ) : null}

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Pair label={t("label.session")}>
          <Link href={`/app/sessions/${frame.sessionId}`} className="underline-offset-4 hover:underline">
            <bdi>{frame.sessionTitle}</bdi>
          </Link>
        </Pair>
        <Pair label={t("label.uploader")}>
          <Who who={frame.author} fallback={t("member")} />
        </Pair>
        {frame.requests.length > 0 ? (
          <Pair label={t("label.requester")}>
            <span className="flex flex-col gap-1">
              {frame.requests.map((r, i) => (
                <span key={i} className="inline-flex flex-wrap items-center gap-2">
                  <Who who={r.requester} fallback={t("member")} />
                  <span className="text-caption text-fg-muted">{age(r.ageDays)}</span>
                </span>
              ))}
            </span>
          </Pair>
        ) : null}
        {frame.reports.length > 0 ? (
          <Pair label={t("label.reporter")}>
            <span className="flex flex-col gap-2">
              {frame.reports.map((r) => (
                <span key={r.reportId} className="flex flex-col gap-0.5">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Who who={r.reporter} fallback={t("member")} />
                    <span className="text-caption text-fg-muted">{age(r.ageDays)}</span>
                  </span>
                  <span className="text-fg-body">
                    <bdi>{r.reason}</bdi>
                  </span>
                </span>
              ))}
            </span>
          </Pair>
        ) : null}
        <Pair label={t("label.status")}>
          <Badge tone={TONE[frame.status]} size="sm">
            {t(`status.${frame.status}`)}
          </Badge>
        </Pair>
      </dl>

      {deciding ? (
        <Decide
          sessionTitle={frame.sessionTitle}
          remove={removeFrame.bind(null, bound, frame.frameId)}
          other={{ label: t("restore"), run: restoreFrame.bind(null, bound, frame.frameId) }}
        />
      ) : null}
    </article>
  );
}
