import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProposalMaterials } from "@/components/materials/proposal-list";
import { AddCoPresenter } from "@/components/proposals/add-co-presenter";
import { PresenterList } from "@/components/proposals/presenter-list";
import { proposalLine } from "@/components/proposals/proposal-steps";
import { ReasonCard } from "@/components/proposals/reason-card";
import { ScheduledSession } from "@/components/proposals/scheduled-session";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { ProposalStatusBadge } from "@/components/sessions/proposal-status-badge";
import { ActionBar } from "@/components/ui/action-bar";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { Stepper } from "@/components/ui/stepper";
import { SubmitButton } from "@/components/ui/submit-button";
import { TagChip } from "@/components/ui/tag-chip";
import type { Locale } from "@/i18n/routing";
import {
  EDITABLE_PROPOSAL_STATES,
  OPEN_PROPOSAL_STATES,
  getOrgPrefs,
  getProposal,
  getProposalSession,
  listNameableMembers,
} from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import { addCoPresentersAction, answerPresenterInvite, dropCoPresenter } from "../actions";

// SCR-018 · /app/propose/[id] — my proposal. REBUILT from `Proposal.dc.html` (REQ-UIX-067, DEC-213, DEC-214), written
// after the old page was deleted (DEC-208); the kept-behaviour table is `docs/plan/notes/sessions.md` W19.2.
//
// The artboard's order: the back control, «مقترحي» and the date — then the line (`ui/stepper`), the reviewer's reason
// with the one primary, the summary, the presenters, the draft materials, and the bar mirroring the primary.
// Immersive (DEC-214 §3): no tab bar, its own bottom bar; the page owns its top row below `lg`.
//
// Who may see it is `proposals_read_own_or_staff`, not a check here: the proposer and the named co-presenters. No row
// is `notFound()`, never «not yours». `admin_notes` is withheld from a co-presenter by the DTO (`proposals.ts:268`).
//
// ★ Rulings this page is built on: the line has four steps outside changes requested, and a draft or a rejected
// proposal shows its badge instead (D3); the date is `updated_at`, «آخر تحديث» (D2); the reviewer is never named
// (§5.99); «مُجدوَل» lights from published (D15); remove is offered in the four open states only (D9); the replies
// are noun phrases (D8). Not built (DEC-213): «السجل» (§5.100), «اسحب المقترح» (§5.101).

const LEVEL_KEY = { introductory: "form.levelIntroductory", intermediate: "form.levelIntermediate", advanced: "form.levelAdvanced" } as const;

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { created, updated } = await searchParams;

  const [proposal, prefs, t, tp, tType] = await Promise.all([
    getProposal(locale, id),
    getOrgPrefs(locale),
    getTranslations("proposals.proposal"),
    getTranslations("proposals.propose"),
    getTranslations("sessions.eventType"),
  ]);
  if (!proposal) notFound();
  const [session, viewer] = await Promise.all([proposal.state === "approved" ? getProposalSession(locale, proposal.id) : null, requireSession(locale)]);

  const named = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;
  const mine = proposal.viewerIsProposer;
  const open = OPEN_PROPOSAL_STATES.includes(proposal.state);
  const line = proposalLine(proposal.state, session?.scheduled ?? false);

  // The one primary, by state — the reason card's (or the line's) and the bar's are the same control.
  const primary =
    mine && EDITABLE_PROPOSAL_STATES.includes(proposal.state)
      ? { href: `/app/propose/${proposal.id}/edit`, label: proposal.state === "changes_requested" ? t("resubmitAction") : t("editDraft") }
      : session?.scheduled
        ? { href: `/app/sessions/${session.id}`, label: t("openSession") }
        : null;

  // Adding: the proposer, while open, with a slot left — the org's `max + 1`, every row counted (DEC-213 §5.104).
  const slots = prefs.maxCoPresenters + 1 - proposal.presenters.length;
  const onProposal = new Set(proposal.presenters.map((p) => p.memberId));
  const addable = mine && open ? (await listNameableMembers(locale)).filter((m) => !onProposal.has(m.id)) : [];

  // Bound Server Actions, never closures across the boundary (DEC-159).
  const answer = answerPresenterInvite.bind(null, locale as Locale, proposal.id);
  const remove = Object.fromEntries(
    proposal.presenters.filter((p) => !p.isProposer).map((p) => [p.memberId, dropCoPresenter.bind(null, locale as Locale, proposal.id, p.memberId)]),
  );

  // A receipt for the round trip that brought the member here (DEC-214 D4): news about their own act, not an alert.
  const receipt = created
    ? {
        title: proposal.state === "draft" ? tp("created.draftTitle") : tp("created.submittedTitle"),
        body: tp.rich(proposal.state === "draft" ? "created.draftBody" : "created.submittedBody", { title: proposal.title, t: named }),
      }
    : updated
      ? {
          title: updated === "draft" ? t("updated.draftTitle") : t("updated.submittedTitle"),
          body: updated === "draft" ? null : t.rich("updated.submittedBody", { title: proposal.title, t: named }),
        }
      : null;

  const showReason = Boolean(proposal.decisionReason) && (proposal.state === "changes_requested" || proposal.state === "rejected");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {receipt ? (
        <div role="status">
          <Panel tone="success">
            <p className="text-label text-fg-heading">{receipt.title}</p>
            {receipt.body ? <p className="mt-2 text-body text-fg-body">{receipt.body}</p> : null}
          </Panel>
        </div>
      ) : null}

      {/* The top row: back to «مقترحاتي», the title, the date. */}
      <div className="flex items-center gap-2.5 pt-2">
        <Link
          href="/app/propose"
          aria-label={t("back")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading"
        >
          <ArrowIcon direction="back" aria-hidden="true" className="text-[1.125rem]" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-play-sm font-extrabold text-fg-heading">{t("pageTitle")}</h1>
          <p className="text-caption text-fg-muted">
            <bdi>{t("lastUpdated", { date: formatDate(proposal.updatedAt, prefs.timeZone, locale) })}</bdi>
          </p>
        </div>
      </div>

      {line ? (
        <Stepper
          label={t("steps.label")}
          doneLabel={t("steps.done")}
          currentTone={line.tone}
          steps={line.steps.map((s) => ({ id: s.id, label: t(`steps.${s.id}`), status: s.status }))}
          className="mt-1"
        />
      ) : (
        <div>
          <ProposalStatusBadge state={proposal.state} viewerIsProposer={mine} />
        </div>
      )}

      {/* The invitation, for a named co-presenter who has not answered — what they came to do (REQ-PRO-003). Each
          answer is a real <form>, so it works before hydration. */}
      {proposal.viewerInvite === "pending" ? (
        <section aria-labelledby="invite">
          <Panel tone="live">
            <h2 id="invite" className="text-h3 text-fg-heading">
              {t("inviteTitle")}
            </h2>
            <p className="mt-2 text-body text-fg-body">{t("inviteBody")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={answer.bind(null, true)}>
                <SubmitButton size="md">{t("accept")}</SubmitButton>
              </form>
              <form action={answer.bind(null, false)}>
                <SubmitButton variant="secondary" size="md">
                  {t("decline")}
                </SubmitButton>
              </form>
            </div>
          </Panel>
        </section>
      ) : null}

      {/* What happens next, by state — never «you can edit until review starts», which is untrue (D1). */}
      {showReason ? (
        <ReasonCard
          reason={proposal.decisionReason!}
          decidedAt={proposal.updatedAt}
          timeZone={prefs.timeZone}
          locale={locale}
          tone={proposal.state === "changes_requested" ? "signal" : "muted"}
          action={
            primary && proposal.state === "changes_requested" ? (
              <ButtonLink href={primary.href} size="lg" className="w-full">
                {primary.label}
              </ButtonLink>
            ) : null
          }
        />
      ) : null}
      {proposal.state === "draft" && mine ? (
        <div className="flex flex-col gap-3">
          <p className="text-body text-fg-muted">{t("nextDraft")}</p>
          {primary ? (
            <ButtonLink href={primary.href} size="lg" className="w-full">
              {primary.label}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      {proposal.state === "submitted" || proposal.state === "in_review" ? <p className="text-body text-fg-muted">{t("nextPending")}</p> : null}
      {session ? <ScheduledSession session={session} teamColor={null} teamName={proposal.categoryName ?? proposal.title} /> : null}
      {proposal.state === "rejected" && mine ? (
        <Link href="/app/propose" className="self-start text-body-sm text-fg-heading underline underline-offset-4">
          {t("proposeAnother")}
        </Link>
      ) : null}

      {/* The summary: the title, its chips, the abstract — and the audience and (the proposer's only) the notes. */}
      <section aria-labelledby="summary" className="flex flex-col gap-2 pt-1">
        <h2 id="summary" className="font-display text-play-sm font-extrabold text-fg-heading">
          <bdi>{proposal.title}</bdi>
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {/* REQ-SES-022: the event type the proposer picked. */}
          {proposal.eventType ? (
            <li>
              <TagChip label={tType(proposal.eventType)} />
            </li>
          ) : null}
          {proposal.categoryName ? (
            <li>
              <TagChip label={proposal.categoryName} />
            </li>
          ) : null}
          <li>
            <TagChip label={tp(LEVEL_KEY[proposal.level])} />
          </li>
          {proposal.expectedDurationMinutes !== null ? (
            <li>
              <TagChip label={tp("duration", { count: proposal.expectedDurationMinutes, value: formatNumber(proposal.expectedDurationMinutes) })} />
            </li>
          ) : null}
        </ul>
        <p className="whitespace-pre-line text-body-sm text-fg-muted">
          <bdi>{proposal.abstract}</bdi>
        </p>
        {proposal.targetAudience || proposal.adminNotes ? (
          <dl className="mt-1 flex flex-col gap-3 border-t border-edge pt-3">
            {proposal.targetAudience ? (
              <div>
                <dt className="text-label text-fg-heading">{tp("form.audienceLabel")}</dt>
                <dd className="mt-1 text-body-sm text-fg-body">
                  <bdi>{proposal.targetAudience}</bdi>
                </dd>
              </div>
            ) : null}
            {proposal.adminNotes ? (
              <div>
                <dt className="text-label text-fg-heading">{tp("form.notesLabel")}</dt>
                <dd className="mt-1 whitespace-pre-line text-body-sm text-fg-body">
                  <bdi>{proposal.adminNotes}</bdi>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="presenters" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="presenters" className="font-display text-h3 font-extrabold text-fg-heading">
            {t("presentersLabel")}
          </h2>
          {mine && open ? <span className="text-caption text-fg-muted">{t("presentersManaged")}</span> : null}
        </div>
        <PresenterList presenters={proposal.presenters} viewerId={viewer.memberId} removable={mine && open} remove={remove} />
        {mine && open ? (
          slots > 0 ? (
            <AddCoPresenter
              members={addable}
              slots={slots}
              limitLabel={tp("form.coPresentersLimit", { count: prefs.maxCoPresenters, value: formatNumber(prefs.maxCoPresenters) })}
              action={addCoPresentersAction.bind(null, locale as Locale, proposal.id)}
            />
          ) : (
            <p className="text-caption text-fg-muted">{t("add.full")}</p>
          )
        ) : null}
      </section>

      {/* The draft materials — `content`'s component as it is (DEC-214 D7); the page owns the landmark (REQ-PRO-004). */}
      <section aria-labelledby="materials" className="flex flex-col gap-2">
        <h2 id="materials" className="font-display text-h3 font-extrabold text-fg-heading">
          {t("materialsLabel")}
        </h2>
        <ProposalMaterials proposalId={proposal.id} locale={locale} />
      </section>

      {primary ? <ActionBar label={t("actionsLabel")} hideFrom="lg" primary={<ButtonLink href={primary.href} size="lg" className="w-full">{primary.label}</ButtonLink>} /> : null}
    </div>
  );
}
