import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getPhotosPageData } from "@/lib/dal/photos";
import { formatNumber } from "@/components/sessions/numerals";
import { UploadWidget } from "@/components/photos/upload-widget";
import { TakedownButton } from "@/components/photos/takedown-button";

// The `Photos` slot (TEAM.md §2 / DEC-046) — REQ-EVT-009 … REQ-EVT-013. No
// <section>/<h2> of its own (the event page owns the landmark and the
// heading, same convention as `Materials`/`Tasks`). `photos_read`'s own
// `hidden_at is null or is_staff()` clause (03 §6) is the entire visibility
// rule — this never re-filters on top of what the DAL already returned.
export async function Photos({ sessionId, locale }: SlotProps) {
  const t = await getTranslations("photos.gallery");
  const { photos, canUpload, isStaff, numerals } = await getPhotosPageData(locale, sessionId);

  return (
    <div>
      {photos.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <>
          <p className="text-body-sm text-fg-muted">{t("count", { count: photos.length, value: formatNumber(photos.length, numerals) })}</p>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 rounded-field border border-edge p-2">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset
                  <img src={p.url} alt="" className="aspect-square w-full rounded-field object-cover" />
                ) : null}
                {p.hiddenAt ? <span className="text-body-sm text-fg-heading">{t("hiddenBadge")}</span> : null}
                <TakedownButton locale={locale} sessionId={sessionId} photoId={p.id} mode={p.hiddenAt && isStaff ? "restore" : "request"} />
              </li>
            ))}
          </ul>
        </>
      )}

      {canUpload ? (
        <div className="mt-4">
          <p className="text-body-sm text-fg-muted">{t("notice")}</p>
          <UploadWidget locale={locale} sessionId={sessionId} />
        </div>
      ) : null}
    </div>
  );
}
