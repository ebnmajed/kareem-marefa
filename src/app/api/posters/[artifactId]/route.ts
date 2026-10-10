import { NextResponse } from "next/server";
import { readPosterBytes } from "@/lib/dal/posters";

// GET /api/posters/{artifactId}?v={render} — a session poster's image, as every member surface draws it (DEC-286,
// REQ-DSG-003). `getSessionPoster()` hands out this path instead of a signed Storage URL, so the URL is the same on
// every page for as long as the render is current and the browser keeps the poster between them.
//
// ★ THE BYTES ARE PROXIED, NOT REDIRECTED — DEC-182's shape, as `/api/avatars/[memberId]` and the brand logo: a
// redirect to a signed URL leaves our origin (`img-src 'self'`) and is a new URL every time. The row and the object are
// read AS THE VIEWER (`readPosterBytes`), so the policies that admitted the signature admit this, and no more.
//
// ★ EVERY REFUSAL IS THE SAME 404 — no session, another org's poster, a PDF, a render not ready, a malformed id.

export const runtime = "nodejs";

const NOT_FOUND = new Headers({ "cache-control": "no-store" });

export async function GET(request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;
  const version = new URL(request.url).searchParams.get("v") ?? "";

  const poster = await readPosterBytes(artifactId, version);
  if (!poster) return new NextResponse("not_found", { status: 404, headers: NOT_FOUND });

  return new NextResponse(new Uint8Array(poster.bytes), {
    headers: {
      "content-type": poster.mime,
      "content-length": String(poster.bytes.byteLength),
      // The render is in the URL: a current one never changes under it. `private`: an org's poster, never a shared
      // cache's. A URL whose render was replaced still answers, revalidated every time.
      "cache-control": poster.current ? "private, max-age=86400, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
      // Our own render, from the worker's Chromium — never framed or run.
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
