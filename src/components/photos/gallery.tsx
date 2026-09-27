import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getPhotosPageData, type PhotoSummary } from "@/lib/dal/photos";
import type { SessionDay } from "@/lib/dal/sessions";
import { dayLabel, dayShortLabel, type DayLabelT } from "@/components/sessions/day-label";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { InfoIcon } from "@/components/ui/icons";
import { UploadWidget } from "@/components/photos/upload-widget";
import { TakedownButton } from "@/components/photos/takedown-button";
import { rescopePhotoAction } from "@/components/photos/actions";
import { RescopeChip, type RescopeOption } from "@/components/materials/rescope-chip";
import { PhotoLightbox, LightboxTile, type LightboxPhoto } from "@/components/photos/lightbox";
import { AlbumControl } from "@/components/photos/album-control";
import { PhotoDownloadNotice } from "@/components/photos/download-notice";

// The `Photos` slot — `id="photos"`, «الصور» (`sessions.md` §22.2) —
// REQ-EVT-009 … REQ-EVT-013. No <section>/<h2> of its own (the event page
// owns the landmark and the heading). `photosSummary()` below shares this
// same cache()d read and its `visible` mirrors this component's own `null`
// return exactly (`16` §5.4.1a(b)). `photos_read`'s own `hidden_at is null
// or is_staff()` clause (03 §6) is the entire visibility rule — this never
// re-filters on top of what the DAL already returned.
//
// ★ REQ-SES-018/DEC-121, contract 7 — the branch below is `days.length <= 1`,
// never bucket emptiness (see `materials/list.tsx`'s own header comment).
// "Photos never ask": grouping here is DISPLAY ONLY — there is no per-group
// upload control, unlike materials/tasks; the one `UploadWidget` stays
// unscoped and stays at the end, exactly where it renders today.
export async function Photos({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("photos.gallery");
  const tDays = await getTranslations("sessions.days");
  const tAlbum = await getTranslations("photos.album");
  const tDownload = await getTranslations("photos.download");
  const { photos, canUpload, isStaff, imageLimitMb, days: rawDays, timeZone, album } = await getPhotosPageData(locale, sessionId);
  const days = rawDays ?? [];

  // ★ visible === false exactly when this returns null (sessions.md §22.4):
  // nothing to show and no upload right, so there is no next action
  // `EmptyState` could honestly offer this viewer.
  if (photos.length === 0 && !canUpload) return null;

  const uploader = canUpload ? (
    <div id="photos-upload-form" className="mt-4 scroll-mt-4">
      {/* REQ-EVT-013: the notice is at the point of upload, not buried. */}
      <Panel tone="info" className="mb-3 flex items-start gap-2 p-3">
        <InfoIcon aria-hidden className="mt-0.5 shrink-0" />
        <p className="text-body-sm text-fg-heading">{t("notice")}</p>
      </Panel>
      <UploadWidget locale={locale} sessionId={sessionId} imageLimitMb={imageLimitMb} />
    </div>
  ) : null;

  if (photos.length === 0) {
    // ★ Not `EmptyState` with its own action — the lead's 390 px review of
    // the ended-event capture: the guard above already returns `null`
    // outright whenever `photos.length === 0 && !canUpload`, so every path
    // that reaches HERE has `canUpload === true` and `uploader` is never
    // `null` — the uploader is unconditionally rendered right below this
    // text. `EmptyState`'s own «إضافة صورة» button was a SECOND primary for
    // the one action already visible, both wired to reuse the exact same
    // label ("upload.action"): a screen reader listed two buttons with the
    // identical accessible name, one of them disabled, and a sighted member
    // saw two primaries for one task. Same fix as the discussion's own
    // empty state (`comment-list.tsx`, e533ad8) — a quiet sentence, no
    // button, because there is nowhere for this viewer to reach this branch
    // without the real action already being right there.
    return (
      <div>
        <p className="text-body text-fg-muted">{t("empty")}</p>
        {uploader}
      </div>
    );
  }

  // REQ-ADM-021 — «تنزيل الكل» for staff, and the notice a refused download comes back to. The
  // slot's first row; no heading of its own (the section's <h2> is the page's).
  const visibleCount = photos.filter((p) => !p.hiddenAt).length;
  const albumRow = isStaff ? (
    <AlbumControl t={tAlbum} sessionId={sessionId} locale={locale} album={album ?? null} visibleCount={visibleCount} timeZone={timeZone ?? "Asia/Riyadh"} />
  ) : null;
  const notice = <PhotoDownloadNotice photoFailed={tDownload("photoFailed")} albumFailed={tDownload("albumFailed")} />;

  if (days.length <= 1) {
    return (
      <PhotoLightbox photos={lightboxSequence(photos)}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-fg-muted">{t("count", { count: photos.length, value: formatNumber(photos.length) })}</p>
            {albumRow}
          </div>
          {notice}
          <PhotoGrid photos={photos} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={null} />
          {uploader}
        </div>
      </PhotoLightbox>
    );
  }

  const sessionScopeLabel = tDays("sessionScope");
  const groups = groupByDay(photos, days, sessionScopeLabel, timeZone ?? "Asia/Riyadh", tDays);
  const options: RescopeOption[] = [
    { id: null, label: sessionScopeLabel },
    ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) })),
  ];

  const shown = groups.filter((g) => g.items.length > 0);
  return (
    // One sequence through every group, in the order the page shows them (DEC-182, Q11).
    <PhotoLightbox photos={lightboxSequence(shown.flatMap((g) => g.items))}>
      <div>
        {albumRow}
        {notice}
        {shown.map((g) => (
          <div key={g.dayId ?? "session"} className="mt-6 first:mt-0">
            <h3 className="text-body font-medium text-fg-heading">{g.heading}</h3>
            <PhotoGrid photos={g.items} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={{ currentLabel: g.shortLabel, options }} />
          </div>
        ))}
        {uploader}
      </div>
    </PhotoLightbox>
  );
}

/** REQ-EVT-016: the lightbox's sequence is the VISIBLE photographs, in page order. A hidden one —
 *  which only staff see in the grid, badged — is never in it, for anyone (DEC-182, Q2). */
function lightboxSequence(photos: PhotoSummary[]): LightboxPhoto[] {
  return photos
    .filter((p) => !p.hiddenAt && p.url)
    .map((p) => ({ id: p.id, url: p.url, width: p.width ?? null, height: p.height ?? null }));
}

interface PhotoGroup {
  dayId: string | null;
  heading: string;
  shortLabel: string;
  items: PhotoSummary[];
}

function groupByDay(photos: PhotoSummary[], days: SessionDay[], sessionScopeLabel: string, timeZone: string, tDays: DayLabelT): PhotoGroup[] {
  return [
    { dayId: null, heading: sessionScopeLabel, shortLabel: sessionScopeLabel, items: photos.filter((p) => (p.sessionDayId ?? null) === null) },
    ...days.map((d) => ({
      dayId: d.id,
      heading: dayLabel(d, timeZone, tDays),
      shortLabel: dayShortLabel(d, tDays),
      items: photos.filter((p) => p.sessionDayId === d.id),
    })),
  ];
}

interface PhotoGridProps {
  photos: PhotoSummary[];
  sessionId: string;
  locale: string;
  isStaff: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"photos.gallery">>>;
  /** `null` at n <= 1 (no scope concept at all); populated at n > 1, where staff alone gets the
   *  interactive chip (REQ-EVT-009: a photo has no presenter-write concept). */
  scope: { currentLabel: string; options: RescopeOption[] } | null;
}

/** Shared by the flat and grouped branches, so they can never drift apart — the flat branch
 *  always passes `scope={null}`, which renders nothing extra, so its output is identical to what
 *  this file rendered before REQ-SES-018. */
function PhotoGrid({ photos, sessionId, locale, isStaff, t, scope }: PhotoGridProps) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((p) => (
        // min-w-0: a grid item's default `min-width: auto` keeps it as
        // wide as its longest unbroken content (the takedown button's
        // own Arabic phrase) even inside a 2-column track — at 390 px
        // that forced the whole page to scroll sideways. `min-w-0`
        // lets the track shrink to the column width and the text wrap.
        <li key={p.id} className="min-w-0">
          {/* `p-2!` (Tailwind's `!important` modifier, `DEC-111`'s own escape from the
              utility-emit-order trap): `Panel`'s own `p-4` is a plain, non-important
              utility of the same `padding` property, so which of the two wins in the
              generated stylesheet depends on emit order, not on the order the two
              classes appear in this string — `important` is the one override immune
              to that. This tile was `p-2` before `ui-lint` ever named it; `Panel`'s
              default is `p-4`, so this keeps the smaller inset on purpose. */}
          <Panel className="flex min-w-0 flex-col gap-2 p-2!">
            {p.url ? (
              <LightboxTile photoId={p.id}>
                {/* ★ THIS TILE CROPS, ON PURPOSE (REQ-UIX-026 asks a photo surface to say
                    so, and why). The grid is an index for FINDING a photograph, not a
                    place to read one: uniform squares keep a two-column grid scannable at
                    390 px, where letterboxed portrait and landscape tiles make it ragged.
                    A photograph is not a designed artefact — the poster rule's own
                    carve-out. The crop is centred because no focal point exists for a
                    member's photograph: nobody sets one, and detecting faces to choose
                    one would be a new processing of personal data. The whole frame is one
                    tap away — the lightbox never crops (`object-contain`). */}
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset */}
                <img src={p.url} alt="" className="aspect-square w-full rounded-field object-cover object-center" />
              </LightboxTile>
            ) : null}
            {p.hiddenAt ? (
              <Badge tone="error" outline size="sm" className="self-start">
                {t("hiddenBadge")}
              </Badge>
            ) : null}
            {/* Staff alone — a photo has no presenter-write concept. The group heading already
                says the scope; only staff gets the chip that can move it. */}
            {scope && isStaff ? (
              <RescopeChip
                currentLabel={scope.currentLabel}
                options={scope.options}
                triggerAriaLabel={t.markup("rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
                failedLabel={t("rescope.failed")}
                rescopeAction={rescopePhotoAction.bind(null, locale, sessionId, p.id)}
              />
            ) : null}
            <TakedownButton locale={locale} sessionId={sessionId} photoId={p.id} mode={p.hiddenAt && isStaff ? "restore" : "request"} />
          </Panel>
        </li>
      ))}
    </ul>
  );
}

/**
 * `sessions.md` §22.3's `SlotSummaryReader` — shares `getPhotosPageData`'s
 * `cache()`d read (§22.4 R-C3), so gating the page's <section> costs no
 * second round trip.
 */
export async function photosSummary({ sessionId, locale }: SlotProps): Promise<SlotSummary> {
  const { photos, canUpload } = await getPhotosPageData(locale, sessionId);
  return { visible: photos.length > 0 || canUpload, count: photos.length, outstanding: null };
}
