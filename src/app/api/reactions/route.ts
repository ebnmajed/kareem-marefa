import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionState } from "@/lib/dal/session";
import { setReaction, setStoryReaction, STORY_REACTION_KINDS } from "@/lib/dal/reactions";

// POST /api/reactions — a like on a comment or a session post, a reaction on a story frame (DEC-290, DEC-291;
// REQ-EVT-003, REQ-EVT-004, REQ-STO-005).
//
// ★ A Route Handler, not a Server Action: Server Actions run ONE AT A TIME per client, so a tap waited behind any
// other action in flight — a story's batched views, a comment being posted — and felt slow. This runs beside them.
// ★ The body is the DESIRED state, never a toggle: the client coalesces quick taps (`lib/reactions/queue.ts`) and
// sends the last one, so a repeat is harmless. The answer is the state the database now holds.
// ★ No Server Action's origin check here, so the `Origin` header must be ours (as `api/photos/albums`). RLS is the
// boundary; the DAL reads the caller's own session and never `service_role`.
//
//   200 { on } | { mine }   — the state now held
//   400 { error: "invalid" } · 401 { error: "unauthorised" } · 403 { error: "origin" } · 500 { error: "failed" }

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

const input = z.discriminatedUnion("target", [
  z.object({ target: z.literal("comment"), id: z.uuid(), kind: z.literal("like"), on: z.boolean() }),
  z.object({ target: z.literal("session"), id: z.uuid(), kind: z.literal("like"), on: z.boolean() }),
  z.object({ target: z.literal("story"), id: z.uuid(), kind: z.enum(STORY_REACTION_KINDS).nullable() }),
]);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "origin" }, { status: 403, headers: NO_STORE });

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });

  const state = await getSessionState();
  if (state.kind !== "member") return NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE });

  try {
    const body = parsed.data;
    if (body.target === "comment") {
      const on = await setReaction("ar", { commentId: body.id }, body.kind, body.on);
      return NextResponse.json({ on }, { headers: NO_STORE });
    }
    if (body.target === "session") {
      const on = await setReaction("ar", { sessionId: body.id }, body.kind, body.on);
      return NextResponse.json({ on }, { headers: NO_STORE });
    }
    const mine = await setStoryReaction("ar", body.id, body.kind);
    return NextResponse.json({ mine }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500, headers: NO_STORE });
  }
}
