import { getTranslations } from "next-intl/server";
import type { SlotProps } from "@/components/sessions/slots";
import { getRsvpPanelData } from "@/lib/dal/rsvp";
import { Panel } from "@/components/ui/panel";
import { CheckCircleIcon, InfoIcon } from "@/components/ui/icons";

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
// Rendered inside the event page's action card, beside `<RsvpPanel>`'s parts;
// the two self-gate on disjoint phases (`open` vs `ended`) so exactly one of
// them ever prints anything for a given viewer.
//
// Reads `getRsvpPanelData()` — the same call `RsvpPanel` makes, and since wave
// 6 a request-scoped `cache()`, so it is one round trip for both.
export async function AttendanceOutcome({ sessionId, locale }: SlotProps) {
  const [data, t] = await Promise.all([getRsvpPanelData(locale, sessionId), getTranslations("rsvp")]);
  if (!data || data.phase !== "ended") return null;
  if (data.relation !== "attended" && data.relation !== "absent") return null;

  // Wave 6 (DEC-130), markup only: a green strip with a check for «حضرت», the
  // quiet «ended» tone for «لم تُسجّل حضورك». Colour is never the only channel —
  // the word carries it, and the glyph differs too (REQ-UIX-003). No margin of
  // its own: the action card spaces its parts.
  const attended = data.relation === "attended";
  return (
    <div role="status">
      <Panel
        tone={attended ? "success" : "ended"}
        className={`flex items-center gap-2.5 px-3.5 py-3 text-body font-medium ${attended ? "text-success" : "text-fg-body"}`}
      >
        {attended ? <CheckCircleIcon className="text-[1.25rem]" /> : <InfoIcon className="text-[1.25rem] text-fg-muted" />}
        <span>{attended ? t("attended") : t("didNotAttend")}</span>
      </Panel>
    </div>
  );
}
