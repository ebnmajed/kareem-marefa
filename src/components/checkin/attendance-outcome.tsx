import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData } from "@/lib/dal/rsvp";

// AttendanceOutcome — `16` §5.3's ★ ask-4 cells (`ended`/`attended` and
// `ended`/`absent`), REQ-UIX-015, DEC-090, DEC-045.
//
// The read-only fact that replaces `RsvpPanel`'s live cancel form once a
// session has ended: «حضرت» or «لم تُسجّل حضورك», never a button. Self-gates
// to exactly the two cells that grant `attendanceOutcome`
// (`affordancesFor("ended", relation)`); renders nothing for every other
// phase or relation — including `none`, `presenter` and `staff`, who never
// had an RSVP to have an outcome about.
//
// ★ Server component, ids as props, NO HEADING OF ITS OWN (16 §5.4.1a(b)):
// the page owns the landmark. `RsvpPanel` renders its own `<h2>` because it
// is a self-contained "الحضور" section; this component is a fact inside
// whatever the page wraps it in, not a section of its own.
//
// Not wired into the event page yet — `page.tsx` is the lead's file for M9
// (DEC-103). Suggested spot: beside `<RsvpPanel>` in the `<aside>`; the two
// self-gate on disjoint phases (`open` vs `ended`) so exactly one of them
// ever prints anything for a given viewer.
//
// ★ Reads `getRsvpPanelData()` a second time — the same call `RsvpPanel`
// makes. A real extra round trip, not a free one; `docs/plan/notes/
// checkin.md` "Wave 5" scope decision 6 flags it as a follow-up once
// `SlotProps` carries `viewerRelation` (DEC-092) and both slots can take it
// as a prop instead of each re-deriving it.
export async function AttendanceOutcome({ sessionId, locale }: SlotProps) {
  const [data, t] = await Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp")]);
  if (!data || data.phase !== "ended") return null;
  if (data.relation !== "attended" && data.relation !== "absent") return null;

  return (
    <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
      {data.relation === "attended" ? t("attended") : t("didNotAttend")}
    </p>
  );
}
