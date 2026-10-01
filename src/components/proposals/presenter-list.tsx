import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ProposalPresenter } from "@/lib/dal/proposals";
import { RemoveCoPresenter } from "./remove-co-presenter";

// SCR-018's «المُقدِّمون» rows — `Proposal.dc.html` (REQ-PRO-003). The avatar with its team ring, the name — «أنت»
// for the viewer's own row — and where each stands: the proposer «المُقدِّم الرئيسي», the others their reply as a NOUN
// phrase (DEC-213 §5.109: nothing stores gender, so no verb about a member). A declined co-presenter stays a row
// (§5.104). Remove is the caller's decision (`removable`): the proposer, any row but theirs, while open (DEC-214 D9).

export async function PresenterList({
  presenters,
  viewerId,
  removable,
  remove,
}: {
  presenters: ProposalPresenter[];
  viewerId: string;
  removable: boolean;
  /** The bound removal for one member — built by the page from its Server Action, never a closure from here. */
  remove: Record<string, () => Promise<void>>;
}) {
  const t = await getTranslations("proposals.proposal");
  return (
    <ul className="flex flex-col gap-2">
      {presenters.map((p) => (
        <li key={p.memberId} className="flex items-center gap-2.5 rounded-card border border-edge bg-surface px-3 py-2.5">
          <Avatar memberId={p.memberId} displayName={p.displayName} src={p.avatarUrl ?? null} size={34} teamColor={p.teamColor ?? null} decorative />
          <span className="min-w-0 flex-1 text-body font-bold text-fg-heading">
            {p.memberId === viewerId ? t("presenterYou") : <bdi>{p.displayName}</bdi>}
          </span>
          {p.isProposer ? (
            <span className="text-caption text-fg-muted">{t("presenterLead")}</span>
          ) : p.declinedAt ? (
            <Badge tone="ended" size="sm">
              {t("reply.declined")}
            </Badge>
          ) : p.accepted ? (
            <Badge tone="success" size="sm">
              {t("reply.accepted")}
            </Badge>
          ) : (
            <Badge tone="neutral" outline size="sm">
              {t("reply.pending")}
            </Badge>
          )}
          {removable && !p.isProposer && remove[p.memberId] ? <RemoveCoPresenter name={p.displayName} action={remove[p.memberId]} /> : null}
        </li>
      ))}
    </ul>
  );
}
