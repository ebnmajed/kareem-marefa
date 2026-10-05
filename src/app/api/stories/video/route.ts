import { NextResponse } from "next/server";
import { initiateStoryVideo, initiateStoryVideoInput } from "@/lib/dal/story-frames";
import { failure, invalid, readJson } from "../_respond";

// POST /api/stories/video — REQ-STO-016. A signed upload URL into the private `story-media` bucket under a fresh frame
// id. The 60 MB cap is the bucket's own `file_size_limit`, enforced by Storage on the PUT itself (the bytes never pass
// through here); the declared size is refused early as a courtesy. `story-media`'s write policy runs the capture gate.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const locale = request.headers.get("x-locale") ?? "ar";
  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = initiateStoryVideoInput.safeParse(read.body);
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.path[0] === "declaredByteSize" && i.code === "too_big");
    return tooBig ? NextResponse.json({ error: "file_too_large" }, { status: 413 }) : invalid(parsed.error);
  }
  try {
    return NextResponse.json(await initiateStoryVideo(locale, parsed.data), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
