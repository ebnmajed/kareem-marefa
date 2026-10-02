import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { ModerationPerson, PhotoForModeration, PhotoStatus } from "@/lib/dal/admin-moderation";
import { dismissPhotoReports, removePhoto, restorePhoto } from "../actions";
import { Decide } from "./decide";

// SCR-051's detail — REQ-UIX-104, from `AdminModerationPhotos.dc.html`, in its order: the photograph large; الجلسة ·
// رفعها · طلب الإخفاء or المُبلِّغ · الحالة; the decision. ★ The status says which it is (REQ-UIX-104's acceptance): a
// takedown's photo is already hidden, a reported one is still visible. A decided photo keeps its detail with its
// status and no decision. The status tones are `DEC-073`'s, not the board's.

const TONE: Record<PhotoStatus, Tone> = { hidden: "info", visible: "neutral", removed: "ended" };

function Who({ who, fallback }: { who: ModerationPerson | null; fallback: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {who ? <Avatar memberId={who.memberId} displayName={who.name} src={who.avatarUrl} teamColor={who.teamColor} size={24} decorative /> : null}
      <bdi>{who?.name ?? fallback}</bdi>
    </span>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-caption text-fg-muted">{label}</dt>
      <dd className="text-body-sm text-fg-heading">{children}</dd>
    </div>
  );
}

export async function PhotoDetail({ locale, photo }: { locale: string; photo: PhotoForModeration }) {
  const t = await getTranslations("photos.moderation");
  const age = (days: number) => t("age", { count: days, value: formatNumber(days) });
  const bound = locale as Locale;
  const deciding = photo.status !== "removed" && (photo.requests.length > 0 || photo.reports.length > 0);

  return (
    <article className="space-y-4">
      {/* The page's h1 is the only display-face heading; this one names the detail for the split view's section. */}
      <h2 id="photo-title" className="sr-only">
        {t("imageAlt", { session: photo.sessionTitle })}
      </h2>
      {photo.imageUrl ? (
        // A signed preview of the stripped photo (REQ-EVT-011) — a preview, not a download (DEC-178).
        // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived preview; next/image would re-host it
        <img
          src={photo.imageUrl}
          alt={t("imageAlt", { session: photo.sessionTitle })}
          className="max-h-[28rem] w-full rounded-tile bg-raised object-contain"
        />
      ) : (
        <div aria-hidden="true" className="aspect-[4/3] w-full rounded-tile bg-raised" />
      )}

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Pair label={t("label.session")}>
          <Link href={`/app/sessions/${photo.sessionId}#photos`} className="underline-offset-4 hover:underline">
            <bdi>{photo.sessionTitle}</bdi>
          </Link>
        </Pair>
        <Pair label={t("label.uploader")}>
          <Who who={photo.uploader} fallback={t("member")} />
        </Pair>
        {photo.requests.length > 0 ? (
          <Pair label={t("label.requester")}>
            <span className="flex flex-col gap-1">
              {photo.requests.map((r, i) => (
                <span key={i} className="inline-flex flex-wrap items-center gap-2">
                  <Who who={r.requester} fallback={t("member")} />
                  <span className="text-caption text-fg-muted">{age(r.ageDays)}</span>
                </span>
              ))}
            </span>
          </Pair>
        ) : null}
        {photo.reports.length > 0 ? (
          <Pair label={t("label.reporter")}>
            <span className="flex flex-col gap-2">
              {photo.reports.map((r) => (
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
          <Badge tone={TONE[photo.status]} size="sm">
            {t(`status.${photo.status}`)}
          </Badge>
        </Pair>
      </dl>

      {deciding ? (
        <Decide
          sessionTitle={photo.sessionTitle}
          remove={removePhoto.bind(null, bound, photo.photoId)}
          other={
            photo.requests.length > 0
              ? { label: t("restore"), run: restorePhoto.bind(null, bound, photo.photoId) }
              : { label: t("dismiss"), run: dismissPhotoReports.bind(null, bound, photo.reports[0].reportId) }
          }
        />
      ) : null}
    </article>
  );
}
