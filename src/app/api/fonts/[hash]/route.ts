import { NextResponse } from "next/server";
import { getFontBinary, isFontHash } from "@/lib/dal/fonts";

// GET /api/fonts/{sha256} — REQ-DSG-016, invariant 12, 06 §6.4 and §7.3.
//
// A Route Handler and not a static asset, because the font set is DATA: the
// platform faces ship in `packages/fonts` and an org's materialised Google
// font lives in the `fonts` bucket and `ENT-fonts` (never in the package).
// One URL shape covers both, and the URL IS the hash — so a different font is
// a different URL rather than a silently different render, which is the whole
// of D66's font half.
//
// Authorisation is `fonts_storage_read` (0037), evaluated by Postgres on the
// caller's own client inside the DAL: every authenticated member may read a
// face, nobody else may. The bucket is deliberately NOT org-prefixed — the
// entire point is that the editor, the worker's Chromium and the worker's
// LibreOffice load the same bytes (03 §6).

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  // The extension is decoration: the hash names the bytes. Stripping it keeps
  // `/api/fonts/{sha}.woff2` and `/api/fonts/{sha}` the same object.
  const sha256 = hash.replace(/\.(woff2|ttf)$/i, "").toLowerCase();
  if (!isFontHash(sha256)) return NextResponse.json({ error: "invalid_hash" }, { status: 400 });

  const locale = request.headers.get("x-locale") ?? "ar";
  const font = await getFontBinary(locale, sha256);
  if (!font) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new NextResponse(new Uint8Array(font.bytes), {
    headers: {
      "content-type": font.contentType,
      // Content-addressed, so it can never go stale: a changed font is a
      // changed URL. `private` because the read is gated by a session.
      "cache-control": "private, max-age=31536000, immutable",
      "content-length": String(font.bytes.byteLength),
    },
  });
}
