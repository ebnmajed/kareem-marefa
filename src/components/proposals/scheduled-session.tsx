import { getTranslations } from "next-intl/server";
import { SessionStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Poster } from "@/components/ui/poster";
import type { ProposalSessionLink } from "@/lib/dal/proposals";

// SCR-018 once the proposal became a session — `M10b.md` §4 «scheduled», DEC-213 §5.98, DEC-214 D15.
//
// Scheduled (published or later): the session's poster whole (REQ-UIX-026) and «افتح الجلسة». Cancelled: the line
// stays at «معتمد» and this names the session with its status badge (D15), so the member is not left wondering. A
// draft session — one the proposer can see only as its presenter — is not scheduled and shows nothing here.

export async function ScheduledSession({ session, teamColor, teamName }: { session: ProposalSessionLink; teamColor: string | null; teamName: string }) {
  const t = await getTranslations("proposals.proposal");
  if (session.state === "cancelled") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
        <span>{t("sessionCancelled")}</span>
        <bdi className="font-bold text-fg-heading">{session.title}</bdi>
        <SessionStatusBadge phase="cancelled" size="sm" />
      </p>
    );
  }
  if (!session.scheduled) return null;
  return (
    <div className="flex flex-col gap-3">
      <Poster
        src={session.posterUrl}
        width={session.posterWidth ?? undefined}
        height={session.posterHeight ?? undefined}
        title={session.title}
        teamColor={teamColor}
        teamName={teamName}
        className="mx-auto w-full max-w-xs"
      />
      <ButtonLink href={`/app/sessions/${session.id}`} size="lg" className="w-full">
        {t("openSession")}
      </ButtonLink>
    </div>
  );
}
