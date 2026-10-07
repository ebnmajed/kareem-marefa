import { cache, Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { affordancesFor, rateAllowed } from "@/components/checkin/session-matrix";
import { Comments, commentsSummary } from "@/components/event/comments";
import { Ratings, ratingsSummary } from "@/components/event/ratings";
import { Materials, materialsSummary } from "@/components/materials/list";
import { Photos, photosSummary } from "@/components/photos/gallery";
import { BookmarkButton } from "@/components/search/bookmark-button";
import { ActionCard } from "@/components/sessions/action-card";
import { EditModeProvider, EditModeToggle } from "@/components/sessions/edit-mode";
import { EventAside } from "@/components/sessions/event-aside";
import { eventCheckInLink } from "@/components/sessions/event-check-in";
import { EventHero } from "@/components/sessions/event-hero";
import { primaryActionFor } from "@/components/sessions/event-actions";
import { EventRecap } from "@/components/sessions/event-recap";
import { EventSection } from "@/components/sessions/event-section";
import { EventSubnav, type EventSubnavItem } from "@/components/sessions/event-subnav";
import { EventTopRow } from "@/components/sessions/event-top-row";
import { formatDate, formatNumber } from "@/components/sessions/numerals";
import { myCertificateHref } from "@/components/sessions/outcome-card";
import { publicCardPath, siteOrigin } from "@/components/sessions/public-card-metadata";
import { ShareLink } from "@/components/sessions/share-link";
import { StoryEntry } from "@/components/sessions/story-entry";
import { AddToStory } from "@/components/stories/add-to-story";
import { isSectionShown, type EventSectionId, type SlotProps, type SlotSummary } from "@/components/sessions/slots";
import { Tasks, tasksSummary } from "@/components/tasks/panel";
import { AlertCircleIcon, InfoIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { Prose } from "@/components/ui/prose";
import { Skeleton } from "@/components/ui/skeleton";
import { TagChip } from "@/components/ui/tag-chip";
import { Avatar } from "@/components/ui/avatar";
import { isSessionBookmarked } from "@/lib/dal/bookmarks";
import { getRatingEligibility } from "@/lib/dal/ratings";
import { getRsvpPanelData } from "@/lib/dal/rsvp";
import { getAttendanceRulePoints } from "@/lib/dal/search";
import { getSessionStory } from "@/lib/dal/stories";
import { canAddToStory } from "@/lib/dal/story-frames";
import { getSessionState, requireSession } from "@/lib/dal/session";
import { isCompanyAttendanceRuleEnabled } from "@/lib/dal/leaderboards";
import { getEventAttendeeFaces, getEventFigures, getSessionForEvent, getViewerCompany, listSessionDays, type EventSession } from "@/lib/dal/sessions";
import { canGrantOn, closingSoon, sessionPhase, type SessionPhase, type ViewerRelation } from "@/lib/session-status";

// SCR-012 · /app/sessions/[id] ★ — the event page, rebuilt in wave 18 from `Event.dc.html`,
// `EventLive.dc.html`, `EventDone.dc.html` and `EventDesktop.dc.html` (REQ-UIX-061, STORY-UIX-048, DEC-205,
// DEC-206 §4.66 – §4.74, DEC-209). ★ DEC-208: this file was deleted and written anew; what it had to keep is the
// kept-behaviour table in `docs/plan/notes/sessions.md` (W18B.2), re-derived from the requirements and the DAL.
//
// The one surface several tracks share (the slot contract, `slots.ts`): this page owns the frame, the hero, the
// action card, the sub-nav and every `<section>` and `<h2>`; the slots render their bodies and no heading; a
// slot that can render nothing takes its section with it (`16` §5.4.1a(b)).
//
// In the artboards' order: the phone's own top row (the shell's bar gives way below `lg`) · the poster whole at
// 4:5, the chips (the phase, the level, ★ the language before the action — REQ-SES-011), the `h1`, the presenter
// card · the action card (moment 1, or the outcome with moment 3) · the recap once ended · the sub-nav · the
// sections, IN EACH PHASE'S ORDER (DEC-209 §2) · the bottom `action-bar` on the phone. From `lg`: the shell's
// bar, the hero band (the poster at the start, the abstract and the tags beside it), the full-width action
// row, and the body with the room and «من يحضر» at its end.
//
// ★ REQ-SES-008: no stream URL, no join link, no remote attendance — none exists in the DTO or the product.
// Who may see this is `sessions_read`: a draft is visible to staff and its own presenters, and no row is a 404.

/** The states `session_public_card()` answers for — share offers the public card only where it answers. */
const CARD_STATES: string[] = ["published", "in_progress", "completed"];

/** The sections the page may render, in each phase's artboard order. The ids are stable; only the order moves. */
type Gated = Exclude<EventSectionId, "attend" | "objectives">;
const ORDER: Record<"open" | "live" | "ended", Gated[]> = {
  open: ["about", "presenters", "tasks", "materials", "discussion", "photos", "rating"],
  live: ["photos", "discussion", "about", "presenters", "materials", "tasks", "rating"],
  ended: ["materials", "photos", "discussion", "about", "presenters", "tasks", "rating"],
};

const ratingRelations: ViewerRelation[] = ["attended", "presenter", "staff"];

// ★ One read per request for the page and its metadata (React's `cache`, which spans both in one render).
const eventSession = cache(getSessionForEvent);

/** The browser tab says the session's title (DEC-273). A visitor who is not a member gets the layout's default and
 *  no redirect here — the page's own `requireSession()` redirects, carrying `?next=` (REQ-AUT-005). Private: the
 *  layout's `noindex` stands, and the link that is SHARED is the public card's, `/s/{id}`, whose tags preview it. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  if ((await getSessionState()).kind !== "member") return {};
  const session = await eventSession(locale, id).catch(() => null);
  return session ? { title: session.title } : {};
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  // The auth boundary at the data, carrying the page back after sign-in (REQ-AUT-005).
  const [me, session, rsvp, days, t] = await Promise.all([
    requireSession(locale, `/${locale}/app/sessions/${id}`),
    eventSession(locale, id),
    getRsvpPanelData(locale, id),
    listSessionDays(locale, id),
    getTranslations("sessions.event"),
  ]);
  if (!session) notFound();

  // ★ One phase, knowing the days (wave 9 contract 9): between two days of a workshop a session is `open`.
  const phase = sessionPhase({ ...session, days });
  const relation = session.viewerRelation;
  // ★ Every gate is the matrix's (REQ-UIX-015, DEC-090) — derived once, never re-written at a call site.
  const can = affordancesFor(phase, relation);
  const canCheckIn = eventCheckInLink(session);
  const endedAttendee = phase === "ended" && relation === "attended";
  const staffOrPresenter = session.viewerIsStaff || session.viewerIsPresenter;
  // ★ Edit mode (the owner's ruling, `edit-mode.tsx`): staff and presenters open the member's page, and «تعديل»
  // reveals what only they may change. `?edit=1` opens it in edit mode — honoured only for a viewer who may edit.
  const editing = staffOrPresenter && query.edit === "1";
  const counted = phase === "live" || phase === "ended";
  const facesPhase = phase === "open" || phase === "live" || phase === "ended" ? phase : null;

  const [eligibility, certificateHref, bookmarked, rulePoints, figures, faces, team, story, canAdd] = await Promise.all([
    endedAttendee ? getRatingEligibility(locale, id) : Promise.resolve(null),
    endedAttendee ? myCertificateHref(locale, id) : Promise.resolve(null),
    isSessionBookmarked(locale, id),
    getAttendanceRulePoints(locale).catch(() => null),
    counted ? getEventFigures(locale, id) : Promise.resolve({ attendedCount: null, rotationSeconds: null }),
    staffOrPresenter && facesPhase ? getEventAttendeeFaces(locale, id, facesPhase) : Promise.resolve([]),
    // «لفريقك» (DEC-210): the viewer's company, only when the org's company attendance rule is on — scoring's gate.
    phase === "open" || phase === "live" ? teamForRule(locale) : Promise.resolve(null),
    // «شاهد القصة» (REQ-STO-008): only while live, and only for a story the feed returns — a frame I may see now.
    phase === "live" ? getSessionStory(locale, id).catch(() => null) : Promise.resolve(null),
    // «أضف إلى القصة» (REQ-STO-011, DEC-269, DEC-278): from a day before the start until a day after the end, for a
    // member who reserved or checked in, a presenter or staff — the database's own gate, asked only in the phases it can
    // answer yes.
    phase === "open" || phase === "live" || phase === "ended" ? canAddToStory(locale, [id]).then((r) => r[id] === true).catch(() => false) : Promise.resolve(false),
  ]);
  // «قيّم الجلسة» only to someone who may and has not yet (REQ-RAT-001, REQ-RAT-003).
  const canRate = rateAllowed(session, relation) && canGrantOn(session, "rate") && Boolean(eligibility?.eligible) && !eligibility?.existing;
  const primary = primaryActionFor({ phase, relation, can, canReserve: rsvp?.canReserve ?? false, seat: rsvp?.seat ?? null, canCheckIn, canRate });
  // The rule's amount (§4.45): a member's, for a session they can still attend — never the presenter's (REQ-CHK-011).
  const points = !session.viewerIsPresenter && (phase === "open" || phase === "live") ? rulePoints : null;

  const slot: SlotProps = { sessionId: session.id, memberId: me.memberId, locale };
  const gates: Record<Gated, boolean> = {
    about: true,
    presenters: session.presenters.some((p) => Boolean(p.bio)),
    tasks: can.tasks,
    materials: can.materials !== "none",
    photos: true,
    discussion: true,
    // By the stored state, never the clock (DEC-090 corollary 2), and not while the card carries «قيّم الجلسة».
    rating: session.state === "completed" && ratingRelations.includes(relation) && !canRate,
  };
  const summaries: Partial<Record<Gated, Promise<SlotSummary>>> = {
    tasks: gates.tasks ? tasksSummary(slot) : undefined,
    materials: gates.materials ? materialsSummary(slot) : undefined,
    photos: gates.photos ? photosSummary(slot) : undefined,
    discussion: gates.discussion ? commentsSummary(slot) : undefined,
    // The presenter's aggregate alone is edit-mode content, so the section is too (`ratingsSummary`).
    rating: gates.rating ? ratingsSummary(slot) : undefined,
  };

  const shareUrl = CARD_STATES.includes(session.state) ? `${siteOrigin()}${publicCardPath(locale, session.id)}` : null;
  const bookmarkable = phase === "open" || phase === "live" || phase === "ended";
  const bookmark = (variant: "icon" | "button") => (bookmarkable ? <BookmarkButton locale={locale} sessionId={session.id} initialBookmarked={bookmarked} variant={variant} /> : null);
  const share = (variant: "icon" | "button") =>
    shareUrl ? (
      <ShareLink url={shareUrl} title={session.title} label={t("actions.share")} copiedLabel={t("shareCopied")} hint={t("shareHint")} failedLabel={t("shareFailed")} variant={variant} />
    ) : null;

  const presentersTitle = session.presenters.length > 1 ? t("presentersLabel") : t("presenterLabel");
  const order = ORDER[phase === "live" ? "live" : phase === "ended" ? "ended" : "open"];
  const titles: Record<Gated, string> = {
    about: t("aboutLabel"),
    presenters: presentersTitle,
    tasks: t("tasksLabel"),
    materials: t("materialsLabel"),
    photos: t("photosLabel"),
    discussion: t("commentsLabel"),
    rating: t("ratingLabel"),
  };
  const navLabels: Record<Gated, string> = {
    about: t("nav.about"),
    presenters: presentersTitle,
    tasks: t("nav.tasks"),
    materials: t("nav.materials"),
    photos: t("nav.photos"),
    discussion: t("nav.discussion"),
    rating: t("nav.rating"),
  };

  const sections: Record<Gated, ReactNode> = {
    about: (
      // From `lg` the abstract and the tags are in the hero band (`EventDesktop.dc.html`).
      <EventSection key="about" id="about" title={titles.about} className="lg:hidden">
        {session.tags.length > 0 ? (
          <ul aria-label={t("tagsLabel")} className="mb-3 flex flex-wrap gap-1.5">
            {session.tags.map((tag) => (
              <li key={tag.normalised}>
                <TagChip label={`#${tag.label}`} href={`/app/sessions?tag=${encodeURIComponent(tag.normalised)}`} />
              </li>
            ))}
          </ul>
        ) : null}
        <Prose>
          <p className="whitespace-pre-line">
            <bdi>{session.abstract}</bdi>
          </p>
        </Prose>
      </EventSection>
    ),
    presenters: (
      <EventSection key="presenters" id="presenters" title={titles.presenters} gate={gates.presenters}>
        <PresenterBios session={session} />
      </EventSection>
    ),
    tasks: (
      <Suspense key="tasks" fallback={<SectionSkeleton />}>
        <EventSection
          id="tasks"
          title={titles.tasks}
          gate={gates.tasks}
          summary={summaries.tasks}
          note={(s) => (s ? t("tasksNote", { done: formatNumber(s.count - (s.outstanding ?? 0)), count: formatNumber(s.count) }) : null)}
        >
          <Tasks {...slot} />
        </EventSection>
      </Suspense>
    ),
    materials: (
      <Suspense key="materials" fallback={<SectionSkeleton />}>
        <EventSection id="materials" title={titles.materials} gate={gates.materials} summary={summaries.materials}>
          <Materials {...slot} />
        </EventSection>
      </Suspense>
    ),
    photos: (
      <Suspense key="photos" fallback={<SectionSkeleton />}>
        <EventSection id="photos" title={titles.photos} gate={gates.photos} summary={summaries.photos} note={phase === "live" ? t("photosNoteLive") : undefined}>
          <Photos {...slot} phase={phase} />
        </EventSection>
      </Suspense>
    ),
    discussion: (
      <Suspense key="discussion" fallback={<SectionSkeleton />}>
        <EventSection
          id="discussion"
          title={titles.discussion}
          gate={gates.discussion}
          summary={summaries.discussion}
          note={(s) => (s ? t("commentsNote", { count: s.count, value: formatNumber(s.count) }) : null)}
        >
          <Comments {...slot} />
        </EventSection>
      </Suspense>
    ),
    rating: (
      <Suspense key="rating" fallback={<SectionSkeleton />}>
        <EventSection id="rating" title={titles.rating} gate={gates.rating} summary={summaries.rating}>
          <Ratings {...slot} />
        </EventSection>
      </Suspense>
    ),
  };

  return (
    <EditModeProvider initialEditing={editing}>
      <article className="mx-auto w-full max-w-6xl px-3 pb-12 lg:px-8">
        <EventTopRow session={session} phase={phase} bookmark={bookmark("icon")} share={share("icon")} story={story ? <StoryEntry story={story} /> : undefined} />
        <DesktopBreadcrumb session={session} />
        <Notices session={session} phase={phase} locale={locale} />
        {staffOrPresenter ? (
          <div className="mb-3 flex justify-end">
            <EditModeToggle editLabel={t("editMode.edit")} doneLabel={t("editMode.done")} editingStatus={t("editMode.editingStatus")} readingStatus={t("editMode.readingStatus")} />
          </div>
        ) : null}

        <EventHero
          session={session}
          phase={phase}
          seat={phase === "open" ? rsvp?.seat : undefined}
          closingSoon={phase === "open" && closingSoon(session.rsvpDeadlineAt)}
          dayCount={days.length}
          points={points}
          locale={locale}
          story={story ? <StoryEntry story={story} /> : undefined}
        />

        {canAdd ? (
          <div className="mt-3 flex justify-start">
            <AddToStory sessionId={id} />
          </div>
        ) : null}

        {/* The card first after the hero, in flow (DEC-045); from `lg` the full-width action row, sticky once
            scrolled past (§4.73). The element is never transformed, filtered or clipped — moment 1 thuds INSIDE it. */}
        <div className="mt-4 lg:sticky lg:top-[var(--header-h)] lg:z-20">
          <ActionCard
            session={session}
            phase={phase}
            days={days}
            can={can}
            rsvp={rsvp}
            primary={primary}
            slot={slot}
            points={points}
            figures={figures}
            faces={faces}
            tasks={summaries.tasks}
            ratingClosesAt={eligibility?.windowClosesAt ?? null}
            certificateHref={certificateHref}
            bookmark={bookmark}
            share={share}
            isAdmin={me.role === "admin"}
            locale={locale}
          />
        </div>

        {phase === "ended" ? (
          <div className="mt-3">
            <Suspense fallback={null}>
              <EventRecap attended={figures.attendedCount} registered={rsvp?.confirmedCount ?? null} photos={summaries.photos} />
            </Suspense>
          </div>
        ) : null}

        <div className="mt-5">
          {/* The sub-nav lists exactly the sections that render; a row-high placeholder holds its place. */}
          <Suspense fallback={<div aria-hidden="true" className="h-14 border-b border-edge" />}>
            <SubnavFor order={order} gates={gates} summaries={summaries} label={t("sectionsNav")} labels={navLabels} />
          </Suspense>
        </div>

        <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-col gap-10">{order.map((sectionId) => sections[sectionId])}</div>
          <EventAside session={session} phase={phase} reserved={rsvp?.confirmedCount ?? null} attended={figures.attendedCount} faces={faces} team={team} />
        </div>
      </article>
    </EditModeProvider>
  );
}

/** The viewer's company for «لفريقك», or null when the rule is off or the member has none (DEC-210). */
async function teamForRule(locale: string): Promise<{ name: string } | null> {
  const [enabled, company] = await Promise.all([isCompanyAttendanceRuleEnabled(locale).catch(() => false), getViewerCompany(locale).catch(() => null)]);
  return enabled && company ? { name: company.name } : null;
}

async function SubnavFor({
  order,
  gates,
  summaries,
  label,
  labels,
}: {
  order: Gated[];
  gates: Record<Gated, boolean>;
  summaries: Partial<Record<Gated, Promise<SlotSummary>>>;
  label: string;
  labels: Record<Gated, string>;
}) {
  const resolved = await Promise.all(order.map((sectionId) => summaries[sectionId] ?? Promise.resolve(undefined)));
  const items: EventSubnavItem[] = order
    .map((sectionId, i) => ({ sectionId, summary: resolved[i] }))
    .filter(({ sectionId, summary }) => isSectionShown(gates[sectionId], summary))
    .map(({ sectionId, summary }) => ({
      id: sectionId,
      label: labels[sectionId],
      // A count where the slot has one, drawn beside the word (`Event.dc.html:68` «النقاش 3»); tasks say theirs in the section.
      count: summary && sectionId !== "tasks" && summary.count > 0 ? formatNumber(summary.count) : undefined,
      lgHidden: sectionId === "about",
      editOnly: summary?.editOnly === true,
    }));
  return <EventSubnav label={label} items={items} />;
}

/** From `lg`: «الجلسات › <category>» above the hero band (`EventDesktop.dc.html:30`); the phone's is its top row. */
async function DesktopBreadcrumb({ session }: { session: EventSession }) {
  const [t, tUi] = await Promise.all([getTranslations("sessions.event"), getTranslations("ui.pageHeader")]);
  return (
    <nav aria-label={tUi("breadcrumb")} className="hidden pt-6 pb-4 lg:block">
      <ol className="flex items-center gap-2 text-caption text-fg-muted">
        <li>
          <Link href="/app/sessions" quiet className="underline-offset-4 hover:text-fg-heading hover:underline">
            {t("breadcrumbRoot")}
          </Link>
        </li>
        {session.categoryId && session.categoryName ? (
          <li className="flex items-center gap-2">
            <span aria-hidden="true">›</span>
            <Link href={`/app/sessions?category=${session.categoryId}`} quiet className="underline-offset-4 hover:text-fg-heading hover:underline">
              <bdi>{session.categoryName}</bdi>
            </Link>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

/** The cancelled alert (REQ-SES-010: shown prominently), the unpublished note, or the ended ribbon in `DEC-073`'s words. */
async function Notices({ session, phase, locale }: { session: EventSession; phase: SessionPhase; locale: string }) {
  const t = await getTranslations("sessions.event");
  const published = ["published", "in_progress", "completed", "archived", "cancelled"].includes(session.state);
  if (session.state === "cancelled") {
    return (
      <div role="alert" className="mb-3">
        <Panel tone="error" className="flex gap-3">
          <AlertCircleIcon className="mt-1 text-[1.25rem] text-error" />
          <div className="min-w-0">
            <p className="text-h3 text-fg-heading">{t("cancelledTitle")}</p>
            {session.cancellationReason ? (
              <>
                <p className="mt-2 text-label text-fg-heading">{t("cancelledReason")}</p>
                <p className="mt-1 text-body text-fg-body">
                  <bdi>{session.cancellationReason}</bdi>
                </p>
              </>
            ) : null}
            <p className="mt-2 text-body-sm text-fg-muted">{t("cancelledNote")}</p>
          </div>
        </Panel>
      </div>
    );
  }
  if (!published) {
    return (
      <div role="status" className="mb-3">
        <Panel tone="info" className="flex gap-3 text-body-sm text-fg-body">
          <InfoIcon className="mt-0.5 text-[1.125rem] text-fg-muted" />
          <p>
            {t("unpublishedNote")} · {t("stateLabel")}: {t(`state.${session.state}`)}
          </p>
        </Panel>
      </div>
    );
  }
  if (phase === "ended" && session.endsAt) {
    // «انتهت هذه الجلسة يوم …» — the status words of DEC-073, not the artboard's «مكتملة» (DEC-209 §2).
    return (
      <Panel tone="ended" className="mb-3 text-center text-body-sm font-medium text-fg-body">
        {t("ribbonEnded", { date: formatDate(session.endsAt, session.timeZone, locale) })}
      </Panel>
    );
  }
  return null;
}

/** «المُقدِّمون» — the bio as each presenter wrote it (REQ-PRF-001), for a presenter who wrote one. No rating, no history (§25 Q5). */
async function PresenterBios({ session }: { session: EventSession }) {
  const t = await getTranslations("sessions.event");
  return (
    <ul className="flex flex-col gap-5">
      {session.presenters
        .filter((p) => p.bio)
        .map((p) => (
          <li key={p.memberId} className="flex items-start gap-3">
            <Avatar memberId={p.memberId} displayName={p.displayName} src={p.avatarUrl ?? null} size={40} teamColor={p.teamColor ?? null} decorative />
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/app/members/${p.memberId}`} className="w-fit text-body font-bold text-fg-heading underline-offset-4 hover:underline">
                <bdi>{p.displayName ?? t("presenterFallback")}</bdi>
              </Link>
              <Prose>
                <p className="whitespace-pre-line">
                  <bdi>{p.bio}</bdi>
                </p>
              </Prose>
            </div>
          </li>
        ))}
    </ul>
  );
}

function SectionSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton variant="title" width="10rem" />
      <Skeleton variant="text" count={3} className="mt-4" />
    </div>
  );
}
