import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePhotoUpload, initiatePhotoUploadInput } from "@/lib/dal/photos";

// POST /api/upload/photo — REQ-EVT-009, REQ-EVT-010, 07 §1/§9.
//
// A Route Handler, not a Server Action: the browser PUTs its bytes directly
// to the signed URL this returns — they never traverse this process (07 §1).
// `photos_storage_write` (checked-in / presenter / staff, for this exact
// session — 03 §6, 0037) is the actual authority; a 403 below is this
// route translating that policy's refusal, not a second check performed
// here by hand.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = initiatePhotoUploadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(parsed.error) }, { status: 400 });
  }

  try {
    const result = await initiatePhotoUpload(locale, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "unknown_error";
  if (message === "not_authorized") return NextResponse.json({ error: message }, { status: 403 });
  return NextResponse.json({ error: "upload_failed" }, { status: 500 });
}
