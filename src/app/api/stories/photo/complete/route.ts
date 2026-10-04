import { NextResponse } from "next/server";
import { completeStoryPhoto, completeStoryPhotoInput } from "@/lib/dal/story-frames";
import { failure, invalid, readJson } from "../../_respond";

// POST /api/stories/photo/complete — REQ-STO-011, REQ-STO-012. The bytes were PUT through the album's own
// `/api/upload/photo`; this hands them to `initiate_story_photo()` — the capture gate, then the album's `process_photo`
// with the caption. Nothing here reads the bytes: the worker strips them before anyone can (REQ-EVT-011).

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = completeStoryPhotoInput.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return NextResponse.json(await completeStoryPhoto(locale, parsed.data), { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
