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
import { RescopeChip, type RescopeOption } from "@/components/photos/rescope-chip";

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
  const { photos, canUpload, isStaff, imageLimitMb, days: rawDays, timeZone } = await getPhotosPageData(locale, sessionId);
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

  if (days.length <= 1) {
    return (
      <div>
        <p className="text-body-sm text-fg-muted">{t("count", { count: photos.length, value: formatNumber(photos.length) })}</p>
        <PhotoGrid photos={photos} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={null} />
        {uploader}
      </div>
    );
  }

  const sessionScopeLabel = tDays("sessionScope");
  const groups = groupByDay(photos, days, sessionScopeLabel, timeZone ?? "Asia/Riyadh", tDays);
  const options: RescopeOption[] = [
    { id: null, label: sessionScopeLabel },
    ...days.map((d) => ({ id: d.id, label: dayShortLabel(d, tDays) })),
  ];

  return (
    <div>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.dayId ?? "session"} className="mt-6 first:mt-0">
            <h3 className="text-body font-medium text-fg-heading">{g.heading}</h3>
            <PhotoGrid photos={g.items} sessionId={sessionId} locale={locale} isStaff={isStaff} t={t} scope={{ currentLabel: g.shortLabel, options }} />
          </div>
        ))}
      {uploader}
    </div>
  );
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
          {/* Staff alone — a photo has no presenter-write concept. The group heading already
              says the scope; only staff gets the chip that can move it. */}
          {scope && isStaff ? (
            <RescopeChip
              locale={locale}
              sessionId={sessionId}
              photoId={p.id}
              currentLabel={scope.currentLabel}
              options={scope.options}
              triggerAriaLabel={t.markup("rescope.trigger", { label: scope.currentLabel, bdi: (chunks) => chunks })}
              failedLabel={t("rescope.failed")}
            />
          ) : null}
          <TakedownButton locale={locale} sessionId={sessionId} photoId={p.id} mode={p.hiddenAt && isStaff ? "restore" : "request"} />
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
