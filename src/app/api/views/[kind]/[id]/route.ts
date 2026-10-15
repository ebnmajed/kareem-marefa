import { NextResponse } from "next/server";
import { z } from "zod";
import { VIEW_KINDS, getViewerList, hasMemberSession } from "@/lib/dal/views";

// GET /api/views/{kind}/{id} — REQ-VEW-004 (DEC-297; notes/views.md §1.3). Who viewed one subject: its owners and staff
// only. Anyone else, a subject the caller cannot see and one that does not exist all get the same 404 — the route says
// nothing about a subject the caller may not list. Name, avatar and the day only; never cached.

export const runtime = "nodejs";

const params = z.object({ kind: z.enum(VIEW_KINDS), id: z.uuid() });
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  if (!(await hasMemberSession())) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  const locale = request.headers.get("x-locale") ?? "ar";
  try {
    const list = await getViewerList(locale, parsed.data.kind, parsed.data.id);
    if (!list) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(list, { headers: NO_STORE });
  } catch (e) {
    console.error("views: list failed", e);
    return NextResponse.json({ error: "views_failed" }, { status: 500, headers: NO_STORE });
  }
}
