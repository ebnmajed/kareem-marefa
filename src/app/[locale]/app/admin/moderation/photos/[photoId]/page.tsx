import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { FRAME_SEGMENT, getPhotoForModeration, getStoryFrameForModeration } from "@/lib/dal/admin-moderation";
import { FrameDetail } from "../_components/frame-detail";
import { PhotoDetail } from "../_components/photo-detail";

// `/app/admin/moderation/photos/[photoId]` — one photo, beside the queue from `lg` and on its own below it, with a way
// back. Staff only, at the data: a member, another org's photo or an unknown id answers the streamed not-found.

export default async function PhotoModerationItemPage({ params }: { params: Promise<{ locale: string; photoId: string }> }) {
  const { locale, photoId } = await params;
  setRequestLocale(locale);
  // ★ Wave 26 (REQ-STO-015): a story frame in the queue — `frame-{id}` — opens its own detail, which plays a video.
  if (photoId.startsWith(FRAME_SEGMENT)) {
    const frame = await getStoryFrameForModeration(locale, photoId.slice(FRAME_SEGMENT.length));
    if (!frame) notFound();
    return <FrameDetail locale={locale} frame={frame} />;
  }
  const photo = await getPhotoForModeration(locale, photoId);
  if (!photo) notFound();
  return <PhotoDetail locale={locale} photo={photo} />;
}
