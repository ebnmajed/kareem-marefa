import type { getTranslations } from "next-intl/server";
import type { PhotoAlbumState } from "@/lib/dal/photos";
import { Button, buttonClass } from "@/components/ui/button";
import { DownloadIcon } from "@/components/ui/icons";
import { formatBytes, formatDate, formatNumber } from "@/components/sessions/numerals";

// «تنزيل الكل» — REQ-ADM-021, DEC-180, DEC-182. Staff only; the slot renders
// this in its first row and nowhere else (the section's heading is the page's).
//
// ★ «READY» IS A STATE READ FROM THE DATA, not a toast and not a timer
// (DEC-146): the notification (`MSG-photo_album_ready`) says it once, and this
// row says it on every render until the album expires — so a reload shows
// exactly what the last one showed. Every control is a plain form POST or a
// plain `<a>` to an audited route, so it works before hydration.

interface AlbumControlProps {
  /** Synchronous on purpose, like `PhotoGrid`: the slot resolves the namespace once and hands
   *  it down, so this renders inside the slot's tree without an async boundary of its own. */
  t: Awaited<ReturnType<typeof getTranslations<"photos.album">>>;
  sessionId: string;
  locale: string;
  album: PhotoAlbumState | null;
  /** Photographs a member can see now — the album holds these and no others. */
  visibleCount: number;
  timeZone: string;
}

export function AlbumControl({ t, sessionId, locale, album, visibleCount, timeZone }: AlbumControlProps) {
  // An expired album arrives as `null` — the DAL drops it (`toAlbumState()`).
  const state = album ? album.status : "none";

  if (state === "none" && visibleCount === 0) return null;

  const request = (label: string) => (
    <form method="post" action={`/api/photos/albums/${sessionId}`}>
      <Button type="submit" variant="secondary" size="md" iconStart={<DownloadIcon aria-hidden />}>
        {label}
      </Button>
    </form>
  );

  if (state === "none") return <div className="flex flex-wrap items-center gap-3">{request(t("request"))}</div>;

  if (state === "queued" || state === "building") {
    return (
      <p role="status" className="text-body-sm text-fg-muted">
        {t("building")}
      </p>
    );
  }

  if (state === "failed" || state === "stale") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-body-sm text-fg-muted">
          {state === "failed" ? t("failed") : t("stale")}
        </p>
        {visibleCount > 0 ? request(state === "failed" ? t("retry") : t("rebuild")) : null}
      </div>
    );
  }

  // ready
  const count = album!.photoCount ?? 0;
  const parts = Math.max(1, album!.parts);
  const href = (part: number) => `/api/photos/albums/${sessionId}/download?part=${part}`;
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-body-sm text-fg-heading">
        {t.rich("ready", {
          count,
          value: formatNumber(count),
          size: formatBytes(album!.byteSize ?? 0, locale),
          bdi: (chunks) => <bdi>{chunks}</bdi>,
        })}
        {album!.expiresAt ? (
          <>
            {" · "}
            {t.rich("expires", { date: formatDate(album!.expiresAt, timeZone, locale), bdi: (chunks) => <bdi>{chunks}</bdi> })}
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/* A plain <a> to the audited route, never `download` and never a signed URL here. */}
        {parts === 1 ? (
          <a href={href(1)} className={buttonClass("secondary", "md", "gap-2")}>
            <DownloadIcon aria-hidden />
            {t("downloadOne")}
          </a>
        ) : (
          Array.from({ length: parts }, (_, i) => (
            <a key={i} href={href(i + 1)} className={buttonClass("secondary", "md", "gap-2")}>
              <DownloadIcon aria-hidden />
              {t.rich("downloadPart", { part: formatNumber(i + 1), parts: formatNumber(parts), bdi: (chunks) => <bdi>{chunks}</bdi> })}
            </a>
          ))
        )}
      </div>
      {visibleCount !== count ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-fg-muted">{t("changed")}</p>
          {visibleCount > 0 ? request(t("rebuild")) : null}
        </div>
      ) : null}
    </div>
  );
}
