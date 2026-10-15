import { NextResponse } from "next/server";
import { hasMemberSession, recordViews, recordViewsInput } from "@/lib/dal/views";

// POST /api/views — REQ-VEW-001, 002, 006 (DEC-297; notes/views.md §1.1). The device's batch of views, sent with
// `fetch(…, { keepalive: true })` or `navigator.sendBeacon` — a Route Handler, never a Server Action (REQ-VEW-006).
//
// ★ A well-formed batch is ALWAYS 204 with no body, whatever `record_views()` recorded: what it skipped (a subject the
// caller may not see, impersonation) is not said, so the answer leaks nothing about other members' subjects. No
// session is a 401, never a redirect — a beacon cannot follow one.

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const parsed = recordViewsInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!(await hasMemberSession())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await recordViews(parsed.data);
  } catch (e) {
    console.error("views: record failed", e);
    return NextResponse.json({ error: "views_failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
