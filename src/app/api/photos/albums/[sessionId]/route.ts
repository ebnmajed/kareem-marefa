import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPhotoAlbum } from "@/lib/dal/photos";
import { backToPhotos, localeOf, NO_STORE } from "@/app/api/photos/redirect";

// POST /api/photos/albums/{sessionId} — «تنزيل الكل», REQ-ADM-021, DEC-180,
// DEC-182. Staff only.
//
// ★ IT RETURNS AT ONCE. `request_photo_album()` writes the audit row and
// enqueues `JOB-zip_session_photos`; the zip is the worker's, never this
// request's — an album of 300 photographs would block a function. The page it
// returns to reads the album's state from the data («نُجهّز»), so a reload says
// the same thing, and no timer is involved (DEC-146).
//
// A plain `<form method="post">` posts here, so it works before hydration. A
// Route Handler has no Server Action's origin check, so the `Origin` header
// must name this host; the auth cookies' `SameSite=Lax` is the second line.

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const locale = localeOf(request);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || !z.uuid().safeParse(sessionId).success) {
    return NextResponse.redirect(backToPhotos(request, locale, "album_failed"), { status: 303, headers: NO_STORE });
  }
  const result = await requestPhotoAlbum(locale, sessionId);
  return NextResponse.redirect(backToPhotos(request, locale, result.status === "queued" ? null : "album_failed"), {
    status: 303,
    headers: NO_STORE,
  });
}
