import { NextResponse } from "next/server";
import { z } from "zod";
import { completePhotoUpload, completePhotoUploadInput } from "@/lib/dal/photos";

// POST /api/upload/photo/complete — REQ-EVT-011, DEC-047, 07 §1/§9.2.
//
// Never reads the uploaded bytes back — it cannot (src/lib/dal/photos.ts's
// module header explains why: `photos_storage_read` denies everyone,
// including the uploader, until a matching `photos` row exists, and that
// row cannot exist unstripped). This only hands the object off to the
// worker, through `initiate_photo_processing()` — the strip, the sniff
// (DEC-009: SVG rejected here too) and the row's own creation all happen
// in `process_photo` (worker/src/tasks/process_photo.ts), never here.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = completePhotoUploadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const result = await completePhotoUpload(locale, parsed.data);
    return NextResponse.json(result, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "unknown_error";
  if (message === "not_authorized") return NextResponse.json({ error: message }, { status: 403 });
  if (message.startsWith("file_too_large")) {
    const [, limitMb] = message.split(":");
    return NextResponse.json({ error: "file_too_large", limitMb: Number(limitMb) }, { status: 413 });
  }
  return NextResponse.json({ error: "upload_failed" }, { status: 500 });
}
