import { NextResponse } from "next/server";
import { z } from "zod";

// The three story upload routes' shared edges (REQ-STO-011, REQ-STO-016). A Route Handler, never a Server Action:
// the bytes go straight to Storage on a signed URL and never traverse this process. Zod first, shape only — the
// authority is `story_capture_open()`, re-derived by every door it reaches (`story-media`'s write policy,
// `initiate_story_photo()`, `begin_story_video()`); a 403 here is a translation of its refusal.

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }
}

export function invalid(error: z.ZodError): NextResponse {
  return NextResponse.json({ error: "invalid_input", issues: z.treeifyError(error) }, { status: 400 });
}

export function failure(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "unknown_error";
  if (message === "not_authorized") return NextResponse.json({ error: message }, { status: 403 });
  if (message === "file_too_large") return NextResponse.json({ error: message }, { status: 413 });
  if (message === "caption_too_long") return NextResponse.json({ error: message }, { status: 400 });
  return NextResponse.json({ error: "upload_failed" }, { status: 500 });
}
