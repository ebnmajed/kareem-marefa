import { getTranslations } from "next-intl/server";
import { AlbumControl } from "@/components/photos/album-control";
import { PhotoDownloadNotice } from "@/components/photos/download-notice";
import { PhotoAlbum } from "@/components/photos/album";
import { LightboxOpenFirst, type LightboxPhoto } from "@/components/photos/lightbox";
import { PhotoGrid } from "@/components/photos/photo-grid";
import { UploadWidget } from "@/components/photos/upload-widget";
import type { RescopeOption } from "@/components/materials/rescope-chip";
import { dayLabel, dayShortLabel } from "@/components/sessions/day-label";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getPhotosPageData, type PhotoSummary } from "@/lib/dal/photos";
import type { SessionPhase } from "@/lib/session-status";

// The `Photos` slot — SCR-012's «الصور», written from `EventLive.dc.html:60-68` and `EventDone.dc.html:76-84`
// (DEC-208: deleted and written anew; its kept-behaviour table is `docs/plan/notes/content.md` § PR B).
// REQ-EVT-009 … REQ-EVT-016, REQ-ADM-021.
//
// ★ No `<section>`, no `<h2>` (slot contract). `null` exactly when `photosSummary()` says not visible.
// ★ `photos_read` is the whole visibility rule (03 §6): nothing is re-filtered here. A photograph exists as a
// row only once stripped (REQ-EVT-011), so nothing here can show one early.
// ★ Who may add is the policy's (REQ-EVT-009); the control follows `canUpload`. Live, it is the dashed tile
// first in the grid; otherwise the quiet pill under it (`EventLive.dc.html:63`, `EventDone.dc.html:83`). The
// org-wide notice and what the control accepts are said beside it (REQ-EVT-013, REQ-UIX-024).
// ★ Photos never ask which day: grouping above one day is display only.

export async function Photos({ sessionId, locale, phase }: SlotProps & { phase?: SessionPhase }) {
  const [t, tUpload, tLightbox, tDays, tAlbum, tDownload] = await Promise.all([
    getTranslations("photos.gallery"),
    getTranslations("photos.upload"),
    getTranslations("photos.lightbox"),
    getTranslations("sessions.days"),
    getTranslations("photos.album"),
    getTranslations("photos.download"),
  ]);
  const { photos, canUpload, isStaff, myMemberId, imageLimitMb, days: rawDays, timeZone, album } = await getPhotosPageData(locale, sessionId);
  if (photos.length === 0 && !canUpload) return null;
  const days = rawDays ?? [];
  const live = phase === "live";

  const tile = canUpload && live ? <UploadWidget locale={locale} sessionId={sessionId} imageLimitMb={imageLimitMb} variant="tile" /> : undefined;
  const pill = canUpload && !live ? <UploadWidget locale={locale} sessionId={sessionId} imageLimitMb={imageLimitMb} variant="pill" /> : null;
  const notice = canUpload ? (
    <div className="flex flex-col gap-1 text-caption text-fg-muted">
      <p>{t("notice")}</p>
      <p>{tUpload.rich("requirement", { limitMb: imageLimitMb, bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
    </div>
  ) : null;

  const visible = photos.filter((p) => !p.hiddenAt);
  const topRow =
    isStaff || visible.length > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        {visible.length > 0 ? <LightboxOpenFirst label={tLightbox("openAlbum")} /> : <span />}
        {isStaff ? <AlbumControl t={tAlbum} sessionId={sessionId} locale={locale} album={album ?? null} visibleCount={visible.length} timeZone={timeZone ?? "Asia/Riyadh"} /> : null}
      </div>
    ) : null;

  const scopes = (): { groups: { dayId: string | null; heading: string; items: PhotoSummary[]; short: string }[]; options: RescopeOption[] } => {
    const sessionScope = tDays("sessionScope");
    return {
      groups: [
        { dayId: null, heading: sessionScope, short: sessionScope, items: photos.filter((p) => (p.sessionDayId ?? null) === null) },
        ...days.map((d) => ({ dayId: d.id as string | null, heading: dayLabel(d, timeZone ?? "Asia/Riyadh", tDays, locale), short: dayShortLabel(d, tDays), items: photos.filter((p) => p.sessionDayId === d.id) })),
      ].filter((g) => g.items.length > 0),
      options: [{ id: null, label: sessionScope }, ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) }))],
    };
  };

  const grouped = days.length > 1 ? scopes() : null;
  const ordered = grouped ? grouped.groups.flatMap((g) => g.items) : photos;

  return (
    // One sequence through every group, in the order the page shows them, visible photographs only (DEC-182).
    <PhotoAlbum photos={lightboxSequence(ordered)} locale={locale} sessionId={sessionId} reportable={reportable(photos, myMemberId)} canDownload={isStaff}>
      <div className="flex flex-col gap-3">
        {topRow}
        <PhotoDownloadNotice photoFailed={tDownload("photoFailed")} albumFailed={tDownload("albumFailed")} />
        {photos.length === 0 ? <p className="text-body text-fg-muted">{t("empty")}</p> : null}
        {grouped ? (
          <>
            {tile ? <PhotoGrid photos={[]} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={null} lead={tile} /> : null}
            {grouped.groups.map((g) => (
              <div key={g.dayId ?? "session"} className="flex flex-col gap-2">
                <h3 className="text-label font-bold text-fg-heading">{g.heading}</h3>
                <PhotoGrid photos={g.items} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={{ currentLabel: g.short, options: grouped.options }} />
              </div>
            ))}
          </>
        ) : photos.length > 0 || tile ? (
          <PhotoGrid photos={photos} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={null} lead={tile} />
        ) : null}
        {notice}
        {pill}
      </div>
    </PhotoAlbum>
  );
}

/** The lightbox's sequence: the VISIBLE photographs, in page order. A hidden one is never in it (DEC-182). */
function lightboxSequence(photos: PhotoSummary[]): LightboxPhoto[] {
  return photos.filter((p) => !p.hiddenAt && p.url).map((p) => ({ id: p.id, url: p.url, width: p.width ?? null, height: p.height ?? null }));
}

/** REQ-EVT-008 (wave 22, F1) — which photographs the viewer may report: every visible one but their own, and whether
 *  they already did. `report_photo()` holds the same rules; this only decides what is offered. */
function reportable(photos: PhotoSummary[], me: string): Record<string, "open" | "reported"> {
  return Object.fromEntries(photos.filter((p) => !p.hiddenAt && p.uploaderId !== me).map((p) => [p.id, p.reportedByMe ? "reported" : "open"]));
}

/** The page's gate and the sub-nav's count — the same `cache()`d read. */
export async function photosSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { photos, canUpload } = await getPhotosPageData(locale, sessionId);
  return { visible: photos.length > 0 || canUpload, count: photos.length, outstanding: null };
}
