import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPhotoAlbumDownload } from "@/lib/dal/photos";
import { backToPhotos, localeOf, NO_STORE } from "@/app/api/photos/redirect";

// GET /api/photos/albums/{sessionId}/download?part=N — one part of a ready
// album, REQ-ADM-021, DEC-182. Staff only.
//
// The album ships in parts, each a complete zip under the Storage upload cap
// (DEC-182); a session under the cap has one, `part=1`, the default. The route
// audits (`record_photo_album_download()`, which refuses anything not `ready`,
// expired, stale or out of range) and only then redirects to a sixty-second URL
// minted as the caller — the bucket's own policy admits only the current build.

export const runtime = "nodejs";

const partSchema = z.coerce.number().int().min(1).max(10_000);

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const locale = localeOf(request);
  const part = partSchema.safeParse(new URL(request.url).searchParams.get("part") ?? "1");
  if (!z.uuid().safeParse(sessionId).success || !part.success) {
    return NextResponse.redirect(backToPhotos(request, locale, "album_failed"), { status: 303, headers: NO_STORE });
  }
  const result = await recordPhotoAlbumDownload(locale, sessionId, part.data);
  if (result.status !== "ok") {
    return NextResponse.redirect(backToPhotos(request, locale, "album_failed"), { status: 303, headers: NO_STORE });
  }
  return NextResponse.redirect(result.url, { status: 303, headers: NO_STORE });
}
