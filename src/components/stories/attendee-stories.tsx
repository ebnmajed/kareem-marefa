import { getTranslations } from "next-intl/server";
import { removeAttendeeFrameAction } from "@/components/stories/actions";
import { AttendeeStoriesClient } from "@/components/stories/attendee-stories-client";
import { listAttendeeStoryFrames } from "@/lib/dal/story-frames";
import { formatNumber } from "@/components/sessions/numerals";

// SCR-044's «قصص الحضور» (`AdminAttendance.dc.html`, REQ-STO-017). Every attendee frame of the session — past its 24
// hours too, which only staff read — with its poster's ring and «أزل». The lead slots it into the attendance page,
// add-only, between the figures and the board; it draws nothing when the session has no attendee frame, and nothing
// for anyone who is not staff. The console register: no motion, no moment (REQ-UIX-053).

export async function AttendeeStories({ locale, sessionId }: { locale: string; sessionId: string }) {
  const frames = await listAttendeeStoryFrames(locale, sessionId);
  if (!frames || frames.length === 0) return null;
  const t = await getTranslations("stories");
  return (
    <AttendeeStoriesClient
      frames={frames}
      title={t("admin.title", { count: frames.length, value: formatNumber(frames.length) })}
      removeAction={removeAttendeeFrameAction.bind(null, locale, sessionId)}
    />
  );
}
