import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { affordancesFor, rateAllowed } from "@/components/checkin/session-matrix";
import { Comments, commentsSummary } from "@/components/event/comments";
import { Ratings } from "@/components/event/ratings";
import { Materials, materialsSummary } from "@/components/materials/list";
import { Photos, photosSummary } from "@/components/photos/gallery";
import { SessionPoster } from "@/components/posters/session-poster";
import { ActionCard } from "@/components/sessions/action-card";
import { eventCheckInLink } from "@/components/sessions/event-check-in";
import { EventHero } from "@/components/sessions/event-hero";
import { primaryActionFor } from "@/components/sessions/event-actions";
import { EventSubnav } from "@/components/sessions/event-subnav";
import { GatedSection } from "@/components/sessions/gated-section";
import { formatDate } from "@/components/sessions/numerals";
import { PresenterList } from "@/components/sessions/presenter-list";
import { publicCardPath, siteOrigin } from "@/components/sessions/public-card-metadata";
import { isSectionShown, type SlotProps, type SlotSummary } from "@/components/sessions/slots";
import { Tasks, tasksSummary } from "@/components/tasks/panel";
import { Panel } from "@/components/ui/panel";
import { Prose } from "@/components/ui/prose";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { TagChip } from "@/components/ui/tag-chip";
import { AlertCircleIcon, InfoIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import { isSessionBookmarked } from "@/lib/dal/bookmarks";
import { listMyCertificates, signCertificateUrl } from "@/lib/dal/certificates";
import { getRatingEligibility } from "@/lib/dal/ratings";
import { getRsvpPanelData } from "@/lib/dal/rsvp";
import { requireSession } from "@/lib/dal/session";
import { getSessionForEvent, listSessionDays, type EventSession } from "@/lib/dal/sessions";
import { canGrantOn, closingSoon, sessionPhase, type ViewerRelation } from "@/lib/session-status";

// SCR-012 · /app/sessions/[id] ★ — the event page, rebuilt in wave 6 to
// `Main.dc.html`, `EventPhone.dc.html` and `EventEnded.dc.html` (DEC-130).
//
// The one surface several tracks share. The contract — section order, ids,
// headings, who renders what and who gates what — is `slots.ts` and
// `docs/plan/notes/sessions.md` §22. In one breath: this page owns the frame,
// the hero, the action card, the sub-nav and every `<section>` and `<h2>`; the
// slots render their bodies and no heading; a slot that can render nothing
// takes its section with it, decided by the slot's summary (`16` §5.4.1a(b)).
//
// Order, at every width (the grid moves the card beside the sections from
// `md`; nothing is rendered twice for layout):
//   ribbon / notices · hero (status, title, presenters, chips — language before
//   the action, REQ-SES-011) · the action card (REQ-SES-013; its primary moves
//   to the bottom action bar on the phone) · sub-nav · نبذة · المُقدِّمون ·
//   المهام · المواد · الصور · النقاش · التقييم
//
// ★ REQ-SES-008: no stream URL, no join link, no remote-attendance affordance.
// There is none in the DTO either, because there is none in the product.
//
// ★ One-day sessions only: this is the schema in the database. Multi-day
// sessions (DEC-119 … DEC-121) and the manual check-in switch (DEC-113 …
// DEC-118) are decided and not built; nothing here anticipates them.
//
// Who may see this is `sessions_read`, not a check here: a draft is visible to
// staff and its own presenters and to nobody else, and no row is a 404.

/** The states `session_public_card()` answers for — the share affordance
 *  and the public card agree on this list or one of them lies. */
const CARD_STATES: string[] = ["published", "in_progress", "completed"];

export default async function EventPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const [me, session, rsvp, days, t] = await Promise.all([
    requireSession(locale, `/${locale}/app/sessions/${id}`),
    getSessionForEvent(locale, id),
    getRsvpPanelData(locale, id),
    // ★ Contract 3. `cache()`d, so the action card's day list and anything else
    // on this page that needs days share this one read. At one day it returns
    // one day and nothing below branches on the count (rule 1).
    listSessionDays(locale, id),
    getTranslations("sessions.event"),
  ]);
  if (!session) notFound();

  // ★ The affordance gates for THIS viewer on THIS session, derived once from
  // `checkin`'s 42-cell matrix rather than re-written at each call site (`16`
  // §5.3, REQ-UIX-015, DEC-090). RLS and the RPCs remain authoritative
  // (REQ-NFR-001): a hidden control is a courtesy, and the database refuses the
  // write regardless. What these fix is offering an action it would refuse.
  // ★ The days are PASSED, never re-derived (contract 9). Between two days of a
  // workshop a session is `open`, not `live` — a member who reads «جارية» on
  // Thursday morning for a Wednesday-and-Friday workshop has been told the
  // wrong thing about a room they might walk to.
  const phase = sessionPhase({ ...session, days });
  const relation = session.viewerRelation;
  const can = affordancesFor(phase, relation);
  // Contract 2: the room's switch and the `ends_at + 2 h` ceiling, from the raw
  // facts rather than the relation — see `event-check-in.ts`.
  const canCheckIn = eventCheckInLink(session);

  // Read only for the viewer they concern: an attendee of an ended session.
  const endedAttendee = phase === "ended" && relation === "attended";
  const [eligibility, certificateHref, bookmarked] = await Promise.all([
    endedAttendee ? getRatingEligibility(locale, id) : Promise.resolve(null),
    endedAttendee ? myCertificateHref(locale, id) : Promise.resolve(null),
    isSessionBookmarked(locale, id),
  ]);
  // The card offers «قيّم الجلسة» only to someone who has not rated yet; an
  // edit, or the window having closed, is the rating section's to say.
  const canRate = rateAllowed(session, relation) && canGrantOn(session, "rate") && Boolean(eligibility?.eligible) && !eligibility?.existing;

  const primary = primaryActionFor({ phase, relation, can, canReserve: rsvp?.canReserve ?? false, seat: rsvp?.seat ?? null, canCheckIn, canRate });

  const slot: SlotProps = { sessionId: session.id, memberId: me.memberId, locale };

  // The page's own conditions, one per gated section. The sub-nav and the
  // sections read the SAME gates through `isSectionShown()`.
  const gates: Record<GatedId, boolean> = {
    about: true,
    presenters: session.presenters.length > 0,
    tasks: can.tasks,
    materials: can.materials !== "none",
    photos: true,
    discussion: true,
    // The Ratings slot renders nothing for a viewer with no stake, so the
    // section is gated by the relations that have one — and by the stored
    // state, never the clock (DEC-090 corollary 2). ★ And not while the action
    // card carries «قيّم الجلسة»: the slot's own call to rate would be a second
    // primary for the same act on one page (`16` §3 principle 2). The section
    // returns once there is something else to say — the edit link, or that the
    // window has closed.
    rating: session.state === "completed" && ratingRelations.includes(relation) && !canRate,
  };

  // The slots' own answers (`slots.ts`, `notes/sessions.md` §22.3), each from
  // the same request-cached read its slot renders from. ★ Asked only where the
  // page's own gate is open: a promise nobody awaits would be a read nobody
  // needs, and a rejection nobody handles.
  const summaries: Partial<Record<GatedId, Promise<SlotSummary>>> = {
    tasks: gates.tasks ? tasksSummary(slot) : undefined,
    materials: gates.materials ? materialsSummary(slot) : undefined,
    photos: gates.photos ? photosSummary(slot) : undefined,
    discussion: gates.discussion ? commentsSummary(slot) : undefined,
  };

  const published = ["published", "in_progress", "completed", "archived", "cancelled"].includes(session.state);
  const shareUrl = CARD_STATES.includes(session.state) ? `${siteOrigin()}${publicCardPath(locale, session.id)}` : null;
  const seat = phase === "open" ? rsvp?.seat : undefined;
  const poster = <SessionPoster sessionId={session.id} locale={locale} />;

  // The sub-nav names a section as its heading does: one presenter is «المُقدِّم»
  // in both places, never «المُقدِّمون» above «المُقدِّم».
  const presentersTitle = session.presenters.length > 1 ? t("presentersLabel") : t("presenterLabel");
  const navLabels: Record<GatedId, string> = {
    about: t("nav.about"),
    presenters: presentersTitle,
    tasks: t("nav.tasks"),
    materials: t("nav.materials"),
    photos: t("nav.photos"),
    discussion: t("nav.discussion"),
    rating: t("nav.rating"),
  };

  return (
    <article>
      <Notices session={session} phase={phase} published={published} locale={locale} />

      <EventHero session={session} dayCount={days.length} phase={phase} seat={seat} closingSoon={phase === "open" && closingSoon(session.rsvpDeadlineAt)} poster={poster} locale={locale} />

      <div className="mx-auto max-w-6xl px-4 pb-12 md:px-8 md:pb-16">
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_372px] md:items-start md:gap-12">
          {/* The card first in the DOM — in flow straight after the hero on the
              phone (REQ-SES-013) — and in the second column from `md`, lifted
              onto the band's bottom edge only, never over the poster. */}
          <div className="-mt-4 md:sticky md:top-[calc(var(--header-h)+1.5rem)] md:col-start-2 md:row-start-1 md:-mt-10">
            <ActionCard
              days={days}
              session={session}
              phase={phase}
              can={can}
              rsvp={rsvp}
              primary={primary}
              slot={slot}
              tasks={summaries.tasks}
              materials={summaries.materials}
              ratingClosesAt={eligibility?.windowClosesAt ?? null}
              certificateHref={certificateHref}
              bookmarked={bookmarked}
              shareUrl={shareUrl}
              isAdmin={me.role === "admin"}
              locale={locale}
            />
          </div>

          <div className="mt-8 flex min-w-0 flex-col gap-10 md:col-start-1 md:row-start-1 md:mt-8">
            {/* The sub-nav lists exactly the sections that render, so it waits on
                the same summaries; a row-high placeholder holds its place. */}
            <Suspense fallback={<div aria-hidden="true" className="h-11 border-b border-edge md:h-[52px]" />}>
              <SubnavFor gates={gates} summaries={summaries} label={t("sectionsNav")} labels={navLabels} />
            </Suspense>

            <GatedSection id="about" title={t("aboutLabel")}>
              {/* On the phone the poster opens «نبذة»; from `md` it is in the hero. */}
              <div className={`mb-5 md:hidden ${phase === "ended" || phase === "cancelled" ? "[&_img]:opacity-50 [&_img]:grayscale" : ""}`}>{poster}</div>
              <Prose>
                <p className="whitespace-pre-line">
                  <bdi>{session.abstract}</bdi>
                </p>
              </Prose>
              {session.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="text-body-sm text-fg-muted">{t("tagsLabel")}</span>
                  {session.tags.map((tag) => (
                    <TagChip key={tag.normalised} label={tag.label} href={`/app/sessions?tag=${encodeURIComponent(tag.normalised)}`} />
                  ))}
                </div>
              ) : null}
            </GatedSection>

            <GatedSection id="presenters" title={presentersTitle} gate={gates.presenters}>
              <PresenterList presenters={session.presenters} />
            </GatedSection>

            <Suspense fallback={<SectionSkeleton />}>
              <GatedSection id="tasks" title={t("tasksLabel")} gate={gates.tasks} summary={summaries.tasks}>
                <Tasks {...slot} />
              </GatedSection>
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <GatedSection id="materials" title={t("materialsLabel")} gate={gates.materials} summary={summaries.materials}>
                <Materials {...slot} />
              </GatedSection>
            </Suspense>

            {phase === "ended" ? (
              <Suspense fallback={null}>
                <EndedStats materials={summaries.materials} photos={summaries.photos} labels={{ materials: t("stats.materials"), photos: t("stats.photos") }} />
              </Suspense>
            ) : null}

            <Suspense fallback={<SectionSkeleton />}>
              <GatedSection id="photos" title={t("photosLabel")} gate={gates.photos} summary={summaries.photos}>
                <Photos {...slot} />
              </GatedSection>
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <GatedSection id="discussion" title={t("commentsLabel")} gate={gates.discussion} summary={summaries.discussion}>
                <Comments {...slot} />
              </GatedSection>
            </Suspense>

            <Suspense fallback={<SectionSkeleton />}>
              <GatedSection id="rating" title={t("ratingLabel")} gate={gates.rating}>
                <Ratings {...slot} />
              </GatedSection>
            </Suspense>
          </div>
        </div>
      </div>
    </article>
  );
}

const ratingRelations: ViewerRelation[] = ["attended", "presenter", "staff"];

/** The page's gated sections, in render order — `EVENT_SECTION_IDS` less the action card. */
const GATED_IDS = ["about", "presenters", "tasks", "materials", "photos", "discussion", "rating"] as const;
type GatedId = (typeof GATED_IDS)[number];

async function SubnavFor({
  gates,
  summaries,
  label,
  labels,
}: {
  gates: Record<GatedId, boolean>;
  summaries: Partial<Record<GatedId, Promise<SlotSummary>>>;
  label: string;
  labels: Record<GatedId, string>;
}) {
  const resolved = await Promise.all(GATED_IDS.map((sectionId) => summaries[sectionId] ?? Promise.resolve(undefined)));
  const items = GATED_IDS.filter((sectionId, i) => isSectionShown(gates[sectionId], resolved[i])).map((sectionId) => ({ id: sectionId, label: labels[sectionId] }));
  return <EventSubnav label={label} items={items} />;
}

/** The cancelled alert (REQ-SES-010: shown prominently), the unpublished note, or the ended ribbon — above the band, on light. */
async function Notices({ session, phase, published, locale }: { session: EventSession; phase: string; published: boolean; locale: string }) {
  const t = await getTranslations("sessions.event");
  if (session.state === "cancelled") {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-8">
        <div role="alert">
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
      </div>
    );
  }
  if (!published) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-8">
        <div role="status">
          <Panel tone="info" className="flex gap-3 text-body-sm text-fg-body">
            <InfoIcon className="mt-0.5 text-[1.125rem] text-fg-muted" />
            <p>
              {t("unpublishedNote")} · {t("stateLabel")}: {t(`state.${session.state}`)}
            </p>
          </Panel>
        </div>
      </div>
    );
  }
  if (phase === "ended" && session.endsAt) {
    // «انتهت هذه الجلسة يوم …» — legible from across the room, scrolling fast
    // (`16` §5.3, ask 6). Full-width, quiet, and never over the status badge.
    return (
      <Panel tone="ended" className="rounded-none border-x-0 border-t-0 text-center text-body font-medium text-fg-body">
        {t("ribbonEnded", { date: formatDate(session.endsAt, session.timeZone, locale) })}
      </Panel>
    );
  }
  return null;
}

/** The ended page's strip — materials and photos only (the lead's ruling on §25 Q8). */
async function EndedStats({
  materials,
  photos,
  labels,
}: {
  materials?: Promise<SlotSummary>;
  photos?: Promise<SlotSummary>;
  labels: { materials: string; photos: string };
}) {
  if (!materials && !photos) return null;
  const [m, p] = await Promise.all([materials, photos]);
  const stats = [
    m && m.visible && m.count > 0 ? { href: "#materials", label: labels.materials, value: m.count } : null,
    p && p.visible && p.count > 0 ? { href: "#photos", label: labels.photos, value: p.count } : null,
  ].filter((s): s is { href: string; label: string; value: number } => s !== null);
  if (stats.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((s) => (
        <a key={s.href} href={s.href} className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
          <Stat label={s.label} value={formatNumber(s.value)} />
        </a>
      ))}
    </div>
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

/** A signed link to the member's own issued certificate for this session, once its PDF has rendered. */
async function myCertificateHref(locale: string, sessionId: string): Promise<string | null> {
  const { certificates } = await listMyCertificates(locale);
  const mine = certificates.find((c) => c.sessionId === sessionId && c.state === "issued" && c.pdfPath);
  return mine?.pdfPath ? signCertificateUrl(locale, mine.pdfPath) : null;
}
