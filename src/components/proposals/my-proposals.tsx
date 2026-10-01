import { getTranslations } from "next-intl/server";
import { ProposalStatusBadge } from "@/components/sessions/proposal-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import type { ProposalSummary } from "@/lib/dal/proposals";

// «مقترحاتي» — the member's own proposals and the ones naming them, ABOVE the form on `/app/propose` (DEC-NEXT-18,
// DEC-213 §5.95). Absent when there are none: the title row's link and this list exist only together.
//
// ★ It is how a named co-presenter REACHES their invitation (REQ-PRO-003): «دُعيت للتقديم» on a proposal they were
// named on, «بانتظار ردّك» while they have not answered. The pipeline itself is SCR-018.

export async function MyProposals({ proposals }: { proposals: ProposalSummary[] }) {
  if (proposals.length === 0) return null;
  const t = await getTranslations("proposals.propose.mine");
  return (
    <section aria-labelledby="mine" className="flex flex-col gap-2.5">
      <SectionHeader id="mine" title={t("title")} count={proposals.length} />
      <ul className="flex flex-col gap-2">
        {proposals.map((p) => (
          <li key={p.id}>
            <Card density="row" href={`/app/propose/${p.id}`}>
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <ProposalStatusBadge state={p.state} size="sm" viewerIsProposer={p.viewerIsProposer} />
                  {p.viewerIsProposer ? null : (
                    <Badge tone="info" outline size="sm">
                      {t("invited")}
                    </Badge>
                  )}
                  {p.viewerInvite === "pending" ? (
                    <Badge tone="live" size="sm">
                      {t("awaitingYou")}
                    </Badge>
                  ) : null}
                </div>
                <h3 className="text-body font-bold text-fg-heading">
                  <bdi>{p.title}</bdi>
                </h3>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
