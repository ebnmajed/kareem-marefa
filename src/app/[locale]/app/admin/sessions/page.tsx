import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, listCategories, listNameableMembers } from "@/lib/dal/proposals";
import { actionsFor, listSchedulableProposals, listSessionsForAdmin, listSessionsForAttendance } from "@/lib/dal/sessions";
import { requireSession } from "@/lib/dal/session";
import { makeSessionDirectly, makeSessionFromProposal, runTransition } from "./actions";
import { DirectSessionSection } from "./direct-session-form";
import { AdminSessionsTable, ModeratorSessionsTable } from "./sessions-table";

// SCR-042 · /app/admin/sessions — session management, rebuilt onto the
// system for wave 6 (`16` §6.7, `DEC-130`; top level only — `admin/sessions/
// [id]/**` is not this track's this wave).
//
// This wave it carries REQ-PRO-007: an approved proposal becomes a session,
// or an admin creates one out of nothing. The state machine's own controls —
// start, complete, cancel, reopen, archive (REQ-SES-003, REQ-SES-005,
// REQ-SES-012) — are STORY-SES-002, and scheduling is SCR-043.
//
// Owned by `sessions` for wave 1 only; handed to `console` at wave 3
// (DEC-042). Admin only, 404 for everyone else — see listSessionsForAdmin().
//
// ★ console (wave 6, SCR-044): a moderator reaches THIS route too, but gets
// a different, much smaller render — `ModeratorSessionsView` below — never
// the admin's management UI. `REQ-ADM-005`'s edit/cancel/publish controls
// stay admin-only; a moderator's only reason to be here is picking a session
// to open its attendance report. The admin path below is unaffected by that
// branch.

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireSession(locale);
  if (session.role === "moderator") return <ModeratorSessionsView locale={locale} />;
  if (session.role === "member") notFound();

  const [sessions, ready, categories, members, prefs, t] = await Promise.all([
    listSessionsForAdmin(locale),
    listSchedulableProposals(locale),
    listCategories(locale),
    listNameableMembers(locale),
    getOrgPrefs(locale),
    getTranslations("admin.sessions"),
  ]);
  if (sessions === null) notFound();

  // `actionsFor` is `lib/dal/sessions.ts`'s own state-machine table
  // (`import "server-only"`) — computed here, once, and threaded down as
  // plain data, since `sessions-table.tsx` is a client module and cannot
  // import that function's module at all.
  const actionsById = Object.fromEntries(sessions.map((s) => [s.id, actionsFor(s.state)]));

  const directAction = makeSessionDirectly.bind(null, locale as Locale);
  // ★ A MAP OF BOUND ACTIONS, not a factory function. `(id) => runTransition.
  // bind(null, locale, id)` looks equivalent and type-checks the same, but it
  // is a PLAIN CLOSURE crossing the server/client boundary as a prop — React
  // Flight only knows how to serialise an actual Server Action reference (a
  // bound `"use server"` export carries that marker; a function that RETURNS
  // one does not), so passing the factory itself would fail to serialise at
  // request time. Binding every row's action here, once, and handing down the
  // finished map is what actually crosses correctly — `tsc` cannot see the
  // difference, and this route is dynamic, so not even `npm run build` would
  // have rendered it to catch this before a real request did.
  const transitionActions = Object.fromEntries(sessions.map((s) => [s.id, runTransition.bind(null, locale as Locale, s.id)]));

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />

      <section aria-labelledby="ready-heading" className="mt-10 max-w-3xl">
        <SectionHeader as="h2" id="ready-heading" title={t("readyTitle")} description={t("readyIntro")} count={ready.length} />
        {ready.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={t("readyEmpty")} size="sm" action={{ label: t("directToggleShow"), href: "#direct-session-toggle" }} />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {ready.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-field border border-edge p-4">
                <div className="min-w-0">
                  <p className="text-label text-fg-heading">
                    <bdi>{p.title}</bdi>
                  </p>
                  <p className="mt-1 text-body-sm text-fg-muted">
                    {p.categoryName ? <bdi>{p.categoryName}</bdi> : null}
                    {p.presenterNames.length > 0 ? (
                      <>
                        {p.categoryName ? " · " : null}
                        {p.presenterNames.map((n, i) => (
                          <span key={n + i}>
                            {i > 0 ? "، " : ""}
                            <bdi>{n}</bdi>
                          </span>
                        ))}
                      </>
                    ) : null}
                  </p>
                </div>
                <form action={makeSessionFromProposal.bind(null, locale as Locale, p.id)} className="ms-auto">
                  {/* The visible label is short; the accessible name names
                      the proposal, because this page also carries a
                      «أنشئ الجلسة» submit for the direct form and two
                      controls with one accessible name doing different
                      things is a REQ-NFR-007 failure a screenshot hides. */}
                  <button
                    type="submit"
                    aria-label={`${t("createFromProposal")} — ${p.title}`}
                    className="inline-flex h-12 items-center rounded-field bg-navy-950 px-6 text-label text-white hover:bg-navy-900"
                  >
                    {t("createFromProposal")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t("directTitle")} className="mt-12 max-w-3xl border-t border-edge pt-8">
        <DirectSessionSection action={directAction} categories={categories} members={members} title={t("directTitle")} />
      </section>

      <section aria-labelledby="all-heading" className="mt-12 max-w-5xl border-t border-edge pt-8">
        <SectionHeader as="h2" id="all-heading" title={t("listTitle")} />
        <div className="mt-4">
          <AdminSessionsTable sessions={sessions} actionsById={actionsById} timeZone={prefs.timeZone} locale={locale} transitionActions={transitionActions} />
        </div>
      </section>
    </>
  );
}

/**
 * SCR-042's moderator render — event-day operations only (REQ-ADM-020): id,
 * title, state, start time, and one link to the session's attendance
 * report (SCR-044). No proposal-to-session pipeline, no direct-create form,
 * no `SessionControls` (start/complete/cancel/archive/reopen are exactly
 * `REQ-ADM-005`'s admin-only scheduling actions).
 */
async function ModeratorSessionsView({ locale }: { locale: string }) {
  const [sessions, prefs, t] = await Promise.all([listSessionsForAttendance(locale), getOrgPrefs(locale), getTranslations("admin.sessions")]);
  if (sessions === null) notFound();

  return (
    <>
      <PageHeader title={t("title")} description={t("moderatorIntro")} />
      <div className="mt-8 max-w-3xl">
        <ModeratorSessionsTable sessions={sessions} timeZone={prefs.timeZone} locale={locale} />
      </div>
    </>
  );
}
