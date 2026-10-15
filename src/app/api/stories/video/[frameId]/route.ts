import { NextResponse } from "next/server";
import { z } from "zod";
import { getMyStoryVideoStatus } from "@/lib/dal/story-frames";
import { failure } from "../../_respond";

// GET /api/stories/video/{frameId} — REQ-STO-016. The author's poll after `/complete`: `processing`, then `visible`
// (with the poster) or `failed` with the worker's reason (notes/story-media.md §1.2 step 4). Never cached: the answer
// changes while the worker runs. Anything that is not the caller's own video frame is a 404 — the same answer as a
// frame that does not exist, so the route says nothing about another member's frames.

export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ frameId: string }> }) {
  const locale = request.headers.get("x-locale") ?? "ar";
  const { frameId } = await ctx.params;
  if (!z.uuid().safeParse(frameId).success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const status = await getMyStoryVideoStatus(locale, frameId);
    if (!status) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
    return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
