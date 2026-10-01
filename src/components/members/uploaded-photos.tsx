import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/components/ui/link";
import type { MemberProfileView } from "@/lib/dal/members";

// «الصور المرفوعة» — `Profile.dc.html:70-73`, `ProfileDesktop.dc.html:62-65`, A33, REQ-PRF-004, contract 3.
//
// Photographs this member UPLOADED that the caller may see — never a tagged one (nothing tags a member). The figure
// is contract 3's count, never the page's length. Each tile opens its photograph's session (`#photos`) — the
// lightbox lives on the event page (DEC-214 §2); «+N» is a count, not a link. Three across on the phone, six from
// `lg`. A noun phrase heading — no verb about the member (DEC-213 §5.109).
export async function UploadedPhotos({ view }: { view: MemberProfileView }) {
  const t = await getTranslations("members.profile");
  const { count, photos } = view.photos;
  const rest = Math.max(0, count - photos.length);
  return (
    <section aria-labelledby="photos" className="flex flex-col gap-2 lg:[grid-area:photos]">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="photos" className="font-display text-play-sm font-extrabold text-fg-heading">
          {t("photos")}
        </h2>
        {count > 0 ? <span className="text-caption text-fg-muted">{formatNumber(count)}</span> : null}
      </div>
      {photos.length === 0 ? (
        <p className="px-1 text-body text-fg-muted">{t("noPhotos")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 lg:grid-cols-6 lg:gap-2">
          {photos.map((p) => (
            <li key={p.id}>
              <Link href={`/app/sessions/${p.sessionId}#photos`} aria-label={t("photoLink")} className="block rounded-tile">
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset */}
                <img src={p.url} alt="" loading="lazy" decoding="async" className="aspect-square w-full rounded-tile object-cover" />
              </Link>
            </li>
          ))}
          {rest > 0 ? (
            <li className="flex aspect-square items-center justify-center rounded-tile bg-raised text-body font-bold text-fg-muted">
              <span aria-hidden="true">{t("morePhotos", { value: formatNumber(rest) })}</span>
              <span className="sr-only">{t("morePhotosSr", { count: rest, value: formatNumber(rest) })}</span>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
