import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPhotoDownload } from "@/lib/dal/photos";
import { backToPhotos, localeOf, NO_STORE } from "@/app/api/photos/redirect";

// GET /api/photos/{photoId}/download — one photograph, REQ-ADM-021, DEC-180
// contract 1, DEC-182.
//
// The lightbox's «تنزيل الصورة» is a plain `<a>` to here. This route audits
// first (`record_photo_download()`, which also decides who may: anyone who may
// see the photograph, never a hidden or removed one) and only then redirects to
// a sixty-second URL minted as the caller. GET with a side effect is deliberate:
// nothing prefetches a plain `<a>`, and one download is one audit row.

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  const locale = localeOf(request);
  if (!z.uuid().safeParse(photoId).success) {
    return NextResponse.redirect(backToPhotos(request, locale, "photo_failed"), { status: 303, headers: NO_STORE });
  }
  const result = await recordPhotoDownload(locale, photoId);
  if (result.status !== "ok") {
    return NextResponse.redirect(backToPhotos(request, locale, "photo_failed"), { status: 303, headers: NO_STORE });
  }
  return NextResponse.redirect(result.url, { status: 303, headers: NO_STORE });
}
