import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageSessions, parseSessionQuery, sessionsHref } from "@/components/admin/sessions/session-query";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type { Locale } from "@/i18n/routing";
import { getConsoleSessions } from "@/lib/dal/admin-sessions";
import { listCategories, listNameableMembers } from "@/lib/dal/proposals";
import { actionsFor, listSchedulableProposals } from "@/lib/dal/sessions";
import { makeSessionDirectly, makeSessionFromProposal, runBulkCancel, runTransition } from "./actions";
import { DirectSessionForm } from "./direct-session-form";
import { SessionsTable } from "./sessions-table";

// SCR-042 · /app/admin/sessions (`REQ-ADM-005`, `REQ-UIX-087`), written from
// `AdminSessions.dc.html` and `AdminSessionsPhone.dc.html` (wave 21, `DEC-208`:
// deleted first). The job (`DEC-227` §0.3): a session is found, filtered and
// acted on in bulk at a desk, and the same rows are cards on a phone.
//
// Three readers, decided here at the data (`REQ-ADM-020`): an admin gets the
// whole screen; a moderator gets the same rows read-only — no selection, no
// creation, no transition — each title opening the session's attendance; a
// member gets the page-level `notFound()`, the streamed contract (`DEC-134`).
// The layout never gates. The page renders nothing of the console frame.
//
// «جلسة جديدة» is a LINK to `?new=1`, which renders the creation region on the
// server above the table: the approved proposals waiting to become sessions,
// one press each (`REQ-PRO-007`, `DEC-228` §3.11), and the direct form — so
// both work without JS.

export default async function AdminSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [data, t] = await Promise.all([getConsoleSessions(locale), getTranslations("admin.sessions")]);
  if (data === null) notFound();
  const admin = data.role === "admin";
  const creating = admin && sp.new === "1";

  const query = parseSessionQuery(sp);
  const slice = pageSessions(data.rows, query);
  const months = [...new Set(data.rows.map((r) => r.monthKey).filter((m): m is string => m !== null))].sort().reverse();

  const [categories, ready, members] = await Promise.all([
    listCategories(locale),
    creating ? listSchedulableProposals(locale) : Promise.resolve([]),
    creating ? listNameableMembers(locale) : Promise.resolve([]),
  ]);

  // `actionsFor` is `lib/dal/sessions.ts`'s state-machine table (server-only),
  // computed here and handed down as data. ★ A MAP OF BOUND ACTIONS, not a
  // factory: a function that returns a bound action is a plain closure, and a
  // closure cannot cross into a client module (wave 6, `DEC-159`).
  const actionsById = admin ? Object.fromEntries(data.rows.map((s) => [s.id, actionsFor(s.state)])) : {};
  const transitionActions = admin ? Object.fromEntries(slice.rows.map((s) => [s.id, runTransition.bind(null, locale as Locale, s.id)])) : {};

  return (
    <>
      <PageHeader
        // The artboards keep «جديدة» on the h1's row at 390 too.
        inlineActions
        title={t("title")}
        actions={
          admin ? (
            <ButtonLink href={`${sessionsHref(query)}${sessionsHref(query).includes("?") ? "&" : "?"}new=1#new-session`} size="md">
              <span className="hidden md:inline">{t("newSession")}</span>
              <span className="md:hidden">{t("newSessionShort")}</span>
            </ButtonLink>
          ) : null
        }
      />

      {creating ? (
        <section id="new-session" aria-labelledby="new-session-heading" className="mt-6 space-y-6">
          <h2 id="new-session-heading" className="text-label text-fg-heading">
            {t("newRegionTitle")}
          </h2>
          <Panel>
            <h3 className="text-label text-fg-heading">{t("readyTitle")}</h3>
            {ready.length === 0 ? (
              <p className="mt-2 text-body-sm text-fg-muted">{t("readyEmpty")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-edge">
                {ready.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-label text-fg-heading">
                        <bdi>{p.title}</bdi>
                      </p>
                      <p className="mt-1 text-body-sm text-fg-muted">
                        {p.categoryName ? <bdi>{p.categoryName}</bdi> : null}
                        {p.presenterNames.map((n, i) => (
                          <span key={n + i}>
                            {i > 0 || p.categoryName ? " · " : null}
                            <bdi>{n}</bdi>
                          </span>
                        ))}
                      </p>
                    </div>
                    <form action={makeSessionFromProposal.bind(null, locale as Locale, p.id)}>
                      {/* The accessible name names the proposal: two «أنشئ الجلسة» controls doing
                          different things on one page is a REQ-NFR-007 failure a screenshot hides. */}
                      <Button type="submit" size="md" aria-label={`${t("createFromProposal")} — ${p.title}`}>
                        {t("createFromProposal")}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel>
            <h3 className="mb-4 text-label text-fg-heading">{t("directTitle")}</h3>
            <DirectSessionForm action={makeSessionDirectly.bind(null, locale as Locale)} categories={categories} members={members} />
          </Panel>
        </section>
      ) : null}

      <section aria-labelledby="all-heading" className="mt-6">
        <h2 id="all-heading" className="sr-only">
          {t("listTitle")}
        </h2>
        <SessionsTable
          key={sessionsHref(query)}
          mode={admin ? "admin" : "moderator"}
          rows={slice.rows}
          query={query}
          total={slice.total}
          from={slice.from}
          to={slice.to}
          page={slice.page}
          pageCount={slice.pageCount}
          timeZone={data.timeZone}
          locale={locale}
          categories={categories}
          months={months}
          actionsById={actionsById}
          transitionActions={transitionActions}
          bulkCancel={admin ? runBulkCancel.bind(null, locale as Locale) : undefined}
        />
      </section>
    </>
  );
}
