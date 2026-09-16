import { getTranslations } from "next-intl/server";
import type { SlotProps, SlotSummary } from "@/components/sessions/slots";
import { getPhotosPageData } from "@/lib/dal/photos";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { InfoIcon } from "@/components/ui/icons";
import { UploadWidget } from "@/components/photos/upload-widget";
import { TakedownButton } from "@/components/photos/takedown-button";

// The `Photos` slot — `id="photos"`, «الصور» (`sessions.md` §22.2) —
// REQ-EVT-009 … REQ-EVT-013. No <section>/<h2> of its own (the event page
// owns the landmark and the heading). `photosSummary()` below shares this
// same cache()d read and its `visible` mirrors this component's own `null`
// return exactly (`16` §5.4.1a(b)). `photos_read`'s own `hidden_at is null
// or is_staff()` clause (03 §6) is the entire visibility rule — this never
// re-filters on top of what the DAL already returned.
export async function Photos({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("photos.gallery");
  // The empty state's action reuses "upload.action" ("إضافة صورة") rather
  // than a second, differently-worded key — message keys are stable
  // (CLAUDE.md, Naming), and the upload button right below it already
  // says exactly this.
  const tUpload = await getTranslations("photos.upload");
  const { photos, canUpload, isStaff, imageLimitMb } = await getPhotosPageData(locale, sessionId);

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
    return (
      <div>
        <EmptyState title={t("empty")} action={{ label: tUpload("action"), href: "#photos-upload-form" }} size="sm" />
        {uploader}
      </div>
    );
  }

  return (
    <div>
      <p className="text-body-sm text-fg-muted">{t("count", { count: photos.length, value: formatNumber(photos.length) })}</p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          // min-w-0: a grid item's default `min-width: auto` keeps it as
          // wide as its longest unbroken content (the takedown button's
          // own Arabic phrase) even inside a 2-column track — at 390 px
          // that forced the whole page to scroll sideways. `min-w-0`
          // lets the track shrink to the column width and the text wrap.
          <li key={p.id} className="flex min-w-0 flex-col gap-2 rounded-field border border-edge p-2">
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset
              <img src={p.url} alt="" className="aspect-square w-full rounded-field object-cover" />
            ) : null}
            {p.hiddenAt ? (
              <Badge tone="error" outline size="sm" className="self-start">
                {t("hiddenBadge")}
              </Badge>
            ) : null}
            <TakedownButton locale={locale} sessionId={sessionId} photoId={p.id} mode={p.hiddenAt && isStaff ? "restore" : "request"} />
          </li>
        ))}
      </ul>
      {uploader}
    </div>
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
