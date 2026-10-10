import { NextResponse } from "next/server";
import { uploadAvatar } from "@/lib/dal/avatars";

// POST /api/avatars/upload — a member's own picture (DEC-280 §2, DEC-281; REQ-PRF-010, REQ-PRF-017).
//
// The crop step sends ONE square JPEG, ≤ 1 MiB, as the raw body. A Route Handler, not a Server Action: the body is
// binary, and an action's cap counts the encoding. The declared type and size are refused here, before Storage; the
// CONTENT is sniffed by `JOB-process_avatar_upload` after the bytes land, so an SVG renamed `.png` is refused there
// (REQ-PRF-017) and the sheet reads the refusal from `GET /api/avatars/upload/{id}`.
//
//   202 { uploadId }                — staged and enqueued; poll the status route
//   415 { error: "png_jpg_only" }   — the declared type is not JPEG or PNG
//   413 { error: "too_large" }      — over 1 MiB by the header or by the counted stream
//   401 { error: "unauthorised" }   — no member session
//   500 { error: "upload_failed" }

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const result = await uploadAvatar(request.body, request.headers.get("content-type"), request.headers.get("content-length"));
  switch (result.status) {
    case "accepted":
      return NextResponse.json({ uploadId: result.uploadId }, { status: 202, headers: NO_STORE });
    case "png_jpg_only":
      return NextResponse.json({ error: "png_jpg_only" }, { status: 415, headers: NO_STORE });
    case "too_large":
      return NextResponse.json({ error: "too_large" }, { status: 413, headers: NO_STORE });
    case "unauthorised":
      return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });
    default:
      return NextResponse.json({ error: "upload_failed" }, { status: 500, headers: NO_STORE });
  }
}
