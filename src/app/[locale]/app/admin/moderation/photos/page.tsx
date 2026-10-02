import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPhotoForModeration, listPhotoQueue } from "@/lib/dal/admin-moderation";
import { photoFilter, photoIdsOf } from "./_components/kind";
import { PhotoDetail } from "./_components/photo-detail";

// SCR-051's own route — the queue (the layout's) and, from `lg`, the filter's first photo open beside it. Below `lg`
// the detail is hidden and the queue is the page (`split-view`'s `narrow`). Staff only, at the data.

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
  const photo = await getPhotoForModeration(locale, first);
  return photo ? <PhotoDetail locale={locale} photo={photo} /> : null;
}
