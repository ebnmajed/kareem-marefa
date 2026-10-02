import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPhotoForModeration } from "@/lib/dal/admin-moderation";
import { PhotoDetail } from "../_components/photo-detail";

// `/app/admin/moderation/photos/[photoId]` — one photo, beside the queue from `lg` and on its own below it, with a way
// back. Staff only, at the data: a member, another org's photo or an unknown id answers the streamed not-found.

export default async function PhotoModerationItemPage({ params }: { params: Promise<{ locale: string; photoId: string }> }) {
  const { locale, photoId } = await params;
  setRequestLocale(locale);
  const photo = await getPhotoForModeration(locale, photoId);
  if (!photo) notFound();
  return <PhotoDetail locale={locale} photo={photo} />;
}
