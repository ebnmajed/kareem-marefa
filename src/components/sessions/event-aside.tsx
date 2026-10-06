import { getTranslations } from "next-intl/server";
import { EditOnly, ReadOnly } from "@/components/sessions/edit-mode";
import { formatNumber } from "@/components/sessions/numerals";
import { AttendeeStack } from "@/components/ui/attendee-stack";
import type { EventAttendeeFace, EventSession } from "@/lib/dal/sessions";
import type { SessionPhase } from "@/lib/session-status";

// The desktop body's end column — `EventDesktop.dc.html:101-116`, REQ-UIX-061. Shown from `lg` only.
//
//   · the room: its name and address, the map as a LINK (§4.71: an embed is a third-party frame the CSP does
//     not admit), the capacity, and «الحضور في القاعة فقط» (REQ-SES-008);
//   · «من يحضر»: how many, in words — never who for a member (A33 rule 3, §4.56); faces only for staff and the
//     session's presenters, whom RLS already answers. The per-company figure does not exist and is not built.
//   · «لفريقك» (DEC-210): for a member with a company, and ONLY when the org's `company_attendance_pct` rule is on,
//     one sentence stating the rule — attending raises the company's share in the race. No round, no count of who
//     attends, no standing. Rule off or no company: nothing.
export async function EventAside({
  session,
  phase,
  reserved,
  attended,
  faces,
  team = null,
}: {
  session: EventSession;
  phase: SessionPhase;
  reserved: number | null;
  attended: number | null;
  faces: EventAttendeeFace[];
  /** The viewer's company, passed only when the org's attendance rule for companies is on. */
  team?: { name: string } | null;
}) {
  const t = await getTranslations("sessions.event");
  const count = phase === "open" ? reserved : attended;
  const countLabel = count === null ? null : phase === "open" ? t("reservedCount", { count, value: formatNumber(count) }) : t("attendedCount", { count, value: formatNumber(count) });
  return (
    <aside className="hidden flex-col gap-3 lg:flex">
      {session.venue ? (
        <section aria-labelledby="aside-venue" className="flex flex-col gap-1.5 rounded-panel border border-edge bg-surface p-4">
          <h2 id="aside-venue" className="text-caption font-bold text-fg-muted">
            {t("venueLabel")}
          </h2>
          <p className="text-body font-bold text-fg-heading">
            <bdi>{session.venue.name}</bdi>
          </p>
          {session.venue.address ? (
            <p className="text-body-sm text-fg-muted">
              <bdi>{session.venue.address}</bdi>
            </p>
          ) : null}
          {session.venue.mapUrl ? (
            <a href={session.venue.mapUrl} rel="noreferrer noopener" target="_blank" className="w-fit text-body-sm font-bold text-accent underline-offset-4 hover:underline">
              {t("mapLink")}
            </a>
          ) : null}
          <p className="text-caption text-fg-muted">
            {session.capacity !== null ? <>{t("seats", { count: session.capacity, value: formatNumber(session.capacity) })} · </> : null}
            {t("inPersonNote")}
          </p>
        </section>
      ) : null}
      {countLabel && phase !== "cancelled" ? (
        <section aria-labelledby="aside-attending" className="flex flex-col gap-2 rounded-panel border border-edge bg-surface p-4">
          <h2 id="aside-attending" className="text-caption font-bold text-fg-muted">
            {t("whoAttends")}
          </h2>
          {faces.length > 0 ? (
            // Faces in edit mode only; read mode is the member's count in words (the owner's ruling, `edit-mode.tsx`).
            <>
              <EditOnly>
                <AttendeeStack label={t("whoAttends")} people={faces.map((f) => ({ memberId: f.memberId, displayName: f.displayName, src: f.avatarUrl, teamColor: f.teamColor }))} countLabel={countLabel} />
              </EditOnly>
              <ReadOnly>
                <p className="text-body-sm text-fg-heading">{countLabel}</p>
              </ReadOnly>
            </>
          ) : (
            <p className="text-body-sm text-fg-heading">{countLabel}</p>
          )}
        </section>
      ) : null}
      {team && (phase === "open" || phase === "live") ? (
        <section aria-labelledby="aside-team" className="flex flex-col gap-1.5 rounded-panel border border-edge bg-surface p-4">
          <h2 id="aside-team" className="text-caption font-bold text-fg-muted">
            {t("forYourTeam")}
          </h2>
          <p className="text-body-sm text-fg-heading">{t.rich("teamRule", { company: team.name, bdi: (c) => <bdi>{c}</bdi> })}</p>
        </section>
      ) : null}
    </aside>
  );
}
