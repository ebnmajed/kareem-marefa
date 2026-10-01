import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import type { SlotSummary } from "@/components/sessions/slots";
import { Stat } from "@/components/ui/stat";

// A completed session in numbers — `EventDone.dc.html:56-60`, `16` §5.3. How many attended of how many
// reserved (a count, never who — `session_attendance_count()`, A33 rule 3), and the photos from the room,
// linking to their section. «أعلى تفاعل» is not built: no reaction aggregate exists (DEC-206 §4.74).
export async function EventRecap({ attended, registered, photos }: { attended: number | null; registered: number | null; photos?: Promise<SlotSummary> }) {
  const [t, photoSummary] = await Promise.all([getTranslations("sessions.event"), photos ?? Promise.resolve(undefined)]);
  const stats: { key: string; value: string; label: string; href?: string }[] = [];
  if (attended !== null && registered !== null && registered > 0) {
    stats.push({ key: "attended", value: formatNumber(attended), label: t("recapAttended", { count: registered, registered: formatNumber(registered) }) });
  }
  if (photoSummary?.visible && photoSummary.count > 0) {
    stats.push({ key: "photos", value: formatNumber(photoSummary.count), label: t("recapPhotos", { count: photoSummary.count }), href: "#photos" });
  }
  if (stats.length === 0) return null;
  return (
    <ul aria-label={t("recapLabel")} className="grid grid-cols-2 gap-2.5">
      {stats.map((s) => (
        <li key={s.key}>
          <Stat label={s.label} value={s.value} href={s.href} />
        </li>
      ))}
    </ul>
  );
}
