import { NextResponse } from "next/server";
import { readAvatar } from "@/lib/dal/avatars";

// GET /api/avatars/{memberId}?v={version}&s={96|192} — a member's picture,
// OUR copy (DEC-099, DEC-180 §3, DEC-182; REQ-PRF-008). Contract 4's route:
// every `avatarUrl` a DTO carries is `avatarHref()`'s path to here.
//
// ★ THE BYTES ARE PROXIED, NOT REDIRECTED (DEC-182). A `303` to a signed
// Storage URL would leave our origin — outside `img-src`, a reported
// violation today and a blocked image once the CSP enforces — and a signed
// URL is a new URL on every render, so no browser could cache it. This is
// `/api/brand/[orgId]/logo`'s shape: the object is read AS THE VIEWER, so
// `avatars_storage_read` re-checks the org and the current version on every
// request, and no `service_role` is anywhere near it (invariant 7).
//
// ★ EVERY REFUSAL IS THE SAME 404 — no session, another org's member, no copy,
// a malformed id or version, a size we do not make. Nothing distinguishes
// them, and `<Avatar>` only ever receives an href when a copy exists, so a
// 404 here is a race, never the ordinary case (REQ-PRF-009's initials are).

export const runtime = "nodejs";

const NOT_FOUND = new Headers({ "cache-control": "no-store" });

export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? "";
  const size = Number(url.searchParams.get("s") ?? "96");

  const avatar = await readAvatar(memberId, version, size);
  if (!avatar) return new NextResponse("not_found", { status: 404, headers: NOT_FOUND });

  return new NextResponse(new Uint8Array(avatar.bytes), {
    headers: {
      "content-type": "image/webp",
      "content-length": String(avatar.bytes.byteLength),
      // The version is in the URL and in the object's path, so a current
      // copy never changes under this URL. `private`: a picture is shown to
      // one org's members, never to a shared cache. A stale `v` gets the
      // current bytes, revalidated every time.
      "cache-control": avatar.current ? "private, max-age=86400, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
      // Our own WebP, re-encoded by the worker — still never framed or run.
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
