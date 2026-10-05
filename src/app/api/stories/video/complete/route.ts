import { NextResponse } from "next/server";
import { completeStoryVideo, completeStoryVideoInput } from "@/lib/dal/story-frames";
import { failure, invalid, readJson } from "../../_respond";

// POST /api/stories/video/complete — REQ-STO-016. After the PUT: `begin_story_video()` re-derives the gate and the
// path, writes the `processing` frame (its author's alone) and enqueues `transcode_story_video`. ffprobe, on the
// worker, decides the 15 seconds and the 60 MB — never this route and never the client.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = completeStoryVideoInput.safeParse(read.body);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return NextResponse.json(await completeStoryVideo(locale, parsed.data), { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
