import { NextResponse } from "next/server";
import { getSessionForCalendar } from "@/lib/dal/calendar";
import { listSessionDays } from "@/lib/dal/sessions";
import { buildIcsCalendar, uidForDay, type CalendarDayInput } from "@/components/calendar/ics";

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
  const url = `${origin}/ar/app/sessions/${session.id}`;
  const place = (venue: { name: string; address: string | null } | null) =>
    venue ? [venue.name, venue.address].filter(Boolean).join("، ") : null;

  // ★ ONE VEVENT PER DAY (REQ-SES-015, DEC-119). The days are read through
  // `sessions`' own `listSessionDays()` (contract 3) — nobody keeps a second
  // query for them, and nobody computes the session's span in TypeScript.
  const days = await listSessionDays("ar", session.id);

  // `0100` gives every session with a window exactly one day, so an empty list
  // means the day read came back empty rather than the session having no
  // meetings — and a calendar file with no VEVENT is worse than the session's
  // own window. This is the fallback, not a branch on «is it multi-day».
  const meetings: CalendarDayInput[] = (
    days.length > 0
      ? days.map((day) => ({
          position: day.position,
          startsAt: day.startsAt,
          endsAt: day.endsAt,
          venue: day.venue as { name: string; address: string | null; mapUrl: string | null } | null,
        }))
      : [{ position: 1, startsAt: session.startsAt, endsAt: session.endsAt, venue: session.venue }]
  ).map((day) => ({
    // Stable across downloads and across the Google sync, so a client that
    // already holds this event UPDATES it rather than adding a second copy.
    uid: uidForDay(session.id, day.position),
    title: session.title,
    description: [session.abstract, day.venue?.mapUrl].filter(Boolean).join("\n\n"),
    startsAt: day.startsAt,
    endsAt: day.endsAt,
    location: place(day.venue),
    url,
    cancelled: session.cancelled,
  }));

  const ics = buildIcsCalendar(meetings, { timeZone: session.timeZone });

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
