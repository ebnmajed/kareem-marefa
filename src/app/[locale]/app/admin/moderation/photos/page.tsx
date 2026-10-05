import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FRAME_SEGMENT, getPhotoForModeration, getStoryFrameForModeration, listPhotoQueue } from "@/lib/dal/admin-moderation";
import { FrameDetail } from "./_components/frame-detail";
import { photoFilter, photoIdsOf } from "./_components/kind";
import { PhotoDetail } from "./_components/photo-detail";

// SCR-051's own route — the queue (the layout's) and, from `lg`, the filter's first photo open beside it. Below `lg`
// the detail is hidden and the queue is the page (`split-view`'s `narrow`). Staff only, at the data.
//
// ★ A DETAIL THAT IS NAMED IS NEVER NAMELESS. `split-view` labels the detail's <section> by `photo-title` while an
// item is open (an empty queue names nothing — `sessions'` fix in split-view). If the open item's detail cannot be read
// (decided and gone between the two reads), the page still draws that heading, visually hidden, so the section never
// points at an id that is not there — axe's aria-prohibited-attr, which the a11y sweep found here. ★ Wave 26: the
// filter's first item may be a story FRAME (`frame-{id}`, REQ-STO-015) — it opens the frame's detail.

export default async function PhotoModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const queue = await listPhotoQueue(locale);
  if (!queue) notFound();
  const [first] = photoIdsOf(queue, photoFilter(query.kind));
  if (!first) return null;
  if (first.startsWith(FRAME_SEGMENT)) {
    const frame = await getStoryFrameForModeration(locale, first.slice(FRAME_SEGMENT.length));
    if (frame) return <FrameDetail locale={locale} frame={frame} />;
  } else {
    const photo = await getPhotoForModeration(locale, first);
    if (photo) return <PhotoDetail locale={locale} photo={photo} />;
  }
  const t = await getTranslations("photos.moderation");
  return (
    <h2 id="photo-title" className="sr-only">
      {t("title")}
    </h2>
  );
}
