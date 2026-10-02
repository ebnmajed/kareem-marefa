import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { diffWords } from "@/components/proposals/diff";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { ProposalStatusBadge } from "@/components/sessions/proposal-status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Prose } from "@/components/ui/prose";
import { TagChip } from "@/components/ui/tag-chip";
import { getProposalMaterialsPageData } from "@/lib/dal/materials";
import { getOrgPrefs, getProposalEdits, getProposalSession, type ProposalEdit, type ProposalForReview } from "@/lib/dal/proposals";
import { decideProposal, openAsSession } from "../actions";
import { DecisionCard } from "./decision-card";
import { MaterialLink } from "./material-link";

// SCR-041's detail — REQ-UIX-088, REQ-PRO-002 … 005, REQ-PRO-009's diff (contract 5), from `AdminProposals.dc.html`,
// in its order: the title, who sent it and when, its state and «افتح كجلسة»; the chips; the abstract; presenters,
// draft materials, notes; the edits since it was sent; the decision. Every field the proposer wrote is here —
// the target audience too, which the artboard leaves out (D4). `<bdi>` on everything a member typed.

export async function ProposalDetail({ locale, proposal }: { locale: string; proposal: ProposalForReview }) {
  // The org's clock, never the reader's (OQ-018).
  const [t, tLevel, tDuration, tKind, prefs, edits, materials, session] = await Promise.all([
    getTranslations("proposals.review"),
    getTranslations("proposals.propose.form"),
    getTranslations("proposals.propose"),
    getTranslations("materials.list.kind"),
    getOrgPrefs(locale),
    getProposalEdits(locale, proposal.id),
    getProposalMaterialsPageData(locale, proposal.id),
    proposal.state === "approved" ? getProposalSession(locale, proposal.id) : Promise.resolve(null),
  ]);
  const timeZone = prefs.timeZone;
  const level = (l: string) => tLevel(`level${l === "introductory" ? "Introductory" : l === "intermediate" ? "Intermediate" : "Advanced"}`);
  const minutes = (n: number) => tDuration("duration", { count: n, value: formatNumber(n) });
  const shown = (edit: ProposalEdit, v: string | null) =>
    v === null ? t("none") : edit.field === "level" ? level(v) : edit.field === "expected_duration_minutes" ? minutes(Number(v)) : v;
  const deciding = proposal.state === "submitted" || proposal.state === "in_review";
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

  return (
    <article className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h2 id="proposal-title" className="text-h2 text-fg-heading">
            <bdi>{proposal.title}</bdi>
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
            {proposal.proposer ? (
              <span className="inline-flex items-center gap-2">
                <Avatar memberId={proposal.proposer.memberId} displayName={proposal.proposer.displayName} src={proposal.proposer.avatarUrl} teamColor={proposal.proposer.teamColor} size={24} decorative />
                <bdi className="text-fg-heading">{proposal.proposer.displayName}</bdi>
              </span>
            ) : null}
            <span>{t.rich("sent", { date: formatDate(proposal.submittedAt, timeZone, locale), t: bdi })}</span>
            <ProposalStatusBadge state={proposal.state} size="sm" viewerIsProposer={false} />
          </p>
        </div>
        {proposal.state === "approved" ? (
          session ? (
            <ButtonLink href={`/app/admin/sessions/${session.id}`} variant="quiet" size="md">
              {t("openSession")}
            </ButtonLink>
          ) : (
            <form action={openAsSession.bind(null, locale as Locale, proposal.id)}>
              <Button type="submit" variant="quiet" size="md">
                {t("openAsSession")}
              </Button>
            </form>
          )
        ) : null}
      </header>

      <ul className="flex flex-wrap gap-2">
        {proposal.categoryName ? (
          <li>
            <TagChip label={proposal.categoryName} />
          </li>
        ) : null}
        <li>
          <TagChip label={level(proposal.level)} />
        </li>
        {proposal.expectedDurationMinutes !== null ? (
          <li>
            <TagChip label={minutes(proposal.expectedDurationMinutes)} />
          </li>
        ) : null}
      </ul>

      {proposal.targetAudience ? (
        <p className="text-body-sm">
          <span className="text-fg-muted">{t("audience")}</span> <bdi className="text-fg-body">{proposal.targetAudience}</bdi>
        </p>
      ) : null}

      <Prose size="sm">
        <p>
          <bdi>{proposal.abstract}</bdi>
        </p>
      </Prose>

      <dl className="grid gap-4 md:grid-cols-3">
        <div>
          <dt className="mb-1 text-label text-fg-muted">{t("presenters")}</dt>
          <dd>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {proposal.presenters.map((p) => (
                <li key={p.memberId} className="inline-flex items-center gap-2 text-body-sm text-fg-heading">
                  <Avatar memberId={p.memberId} displayName={p.displayName} src={p.avatarUrl ?? null} teamColor={p.teamColor ?? null} size={24} decorative />
                  <bdi>{p.displayName}</bdi>
                  {p.accepted ? null : <Badge tone="neutral" size="sm">{t("pendingPresenter")}</Badge>}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-label text-fg-muted">{t("materials")}</dt>
          <dd className="text-body-sm">
            {materials.materials.length === 0 ? (
              t("none")
            ) : (
              <ul className="space-y-1">
                {materials.materials.map((m) => (
                  <li key={m.id}>
                    {m.currentVersionId ? (
                      <MaterialLink locale={locale} materialId={m.id}>
                        <bdi>{m.title}</bdi> · {tKind(m.kind)}
                      </MaterialLink>
                    ) : m.externalUrl ? (
                      <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="text-fg-heading underline underline-offset-4">
                        <bdi>{m.title}</bdi>
                      </a>
                    ) : (
                      <bdi>{m.title}</bdi>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-label text-fg-muted">{t("notes")}</dt>
          <dd className="text-body-sm text-fg-body">{proposal.adminNotes ? <bdi>{proposal.adminNotes}</bdi> : t("none")}</dd>
        </div>
      </dl>

      {/* ★ What changed since it was sent (contract 5, REQ-UIX-088) — absent when nothing did, or when nothing was
          recorded to compare against (a proposal sent before 0179): never a fabricated «unchanged». */}
      {edits && edits.length > 0 ? (
        <details className="rounded-panel border border-edge bg-surface p-4">
          <summary className="min-h-11 cursor-pointer text-label text-fg-heading">{t("edits", { value: formatNumber(edits.length) })}</summary>
          <ul className="mt-3 space-y-3 text-body-sm">
            {edits.map((edit) => (
              <li key={edit.field}>
                <p className="text-caption text-fg-muted">
                  {t(`editField.${edit.field}`)} · <bdi>{formatDate(edit.at, timeZone, locale)}</bdi>
                </p>
                {edit.field === "abstract" && edit.before !== null && edit.after !== null ? (
                  <p className="text-fg-body">
                    <bdi>
                      {diffWords(edit.before, edit.after).map((part, i) =>
                        part.kind === "same" ? (
                          <span key={i}>{part.text}</span>
                        ) : part.kind === "del" ? (
                          <del key={i} className="text-fg-muted">
                            <span className="sr-only">{t("deleted")}</span>
                            {part.text}
                          </del>
                        ) : (
                          <ins key={i} className="font-semibold text-fg-heading no-underline">
                            <span className="sr-only">{t("inserted")}</span>
                            {part.text}
                          </ins>
                        ),
                      )}
                    </bdi>
                  </p>
                ) : (
                  <p className="text-fg-body">
                    <del className="text-fg-muted">
                      <span className="sr-only">{t("deleted")}</span>
                      <bdi>{shown(edit, edit.before)}</bdi>
                    </del>{" "}
                    <ins className="font-semibold text-fg-heading no-underline">
                      <span className="sr-only">{t("inserted")}</span>
                      <bdi>{shown(edit, edit.after)}</bdi>
                    </ins>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {deciding ? (
        <DecisionCard action={decideProposal.bind(null, locale as Locale)} proposalId={proposal.id} proposalTitle={proposal.title} />
      ) : proposal.decisionReason ? (
        <Panel>
          <p className="text-label text-fg-muted">{t("sentReason")}</p>
          <p className="mt-1 text-body-sm text-fg-body">
            <bdi>{proposal.decisionReason}</bdi>
          </p>
        </Panel>
      ) : null}
    </article>
  );
}
