import { NextResponse } from "next/server";
import { getSessionForCalendar } from "@/lib/dal/calendar";
import { buildIcs } from "@/components/calendar/ics";

// GET /api/sessions/[id]/ics — REQ-CAL-001, 08 §6.1, SCR-012.
//
// A Route Handler and not a Server Action, because an action cannot return a
// file and its 1 MB body cap is beside the point: this is a download a
// browser follows.
//
// Authorisation is the DAL's, at the data (CLAUDE.md): `getSessionForCalendar`
// calls `requireSession()` and then reads through RLS, so a session in
// another org returns no row and this answers 404 — indistinguishable from
// one that does not exist, which is the right answer either way.

export const runtime = "nodejs"; // Buffer.byteLength, for the 75-octet folding

/** RFC 6266: an ASCII fallback for old clients, and the real name in UTF-8.
 *  A bare Arabic filename in a header is not ASCII and some clients drop the
 *  whole header rather than the parameter. */
function contentDisposition(id: string, title: string): string {
  const utf8 = encodeURIComponent(`${title}.ics`).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="session-${id}.ics"; filename*=UTF-8''${utf8}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // [v16] params is async. Always await.
  const { id } = await params;

  const session = await getSessionForCalendar("ar", id);
  if (!session) return new NextResponse("not_found", { status: 404 });

  const origin = new URL(request.url).origin;
  const description = [session.abstract, session.venue?.mapUrl].filter(Boolean).join("\n\n");

  const ics = buildIcs({
    // Stable across downloads and across the Google sync, so a client that
    // already holds this event UPDATES it rather than adding a second copy.
    uid: `session-${session.id}@kareem.pp.sa`,
    title: session.title,
    description,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    timeZone: session.timeZone,
    location: session.venue ? [session.venue.name, session.venue.address].filter(Boolean).join("، ") : null,
    url: `${origin}/ar/app/sessions/${session.id}`,
    cancelled: session.cancelled,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      // The charset is not optional: without it a client may read the bytes
      // as Latin-1 and every Arabic character becomes two wrong ones.
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": contentDisposition(session.id, session.title),
      // A session's time can change; a cached ICS would hand out the old one.
      "cache-control": "no-store",
    },
  });
}
