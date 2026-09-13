import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs, listCategories, listNameableMembers } from "@/lib/dal/proposals";
import { actionsFor, listSchedulableProposals, listSessionsForAdmin } from "@/lib/dal/sessions";
import { makeSessionDirectly, makeSessionFromProposal, runTransition } from "./actions";
import { SessionControls } from "./session-controls";
import { DirectSessionForm } from "./direct-session-form";

// SCR-042 · /app/admin/sessions — session management.
//
// This wave it carries REQ-PRO-007: an approved proposal becomes a session,
// or an admin creates one out of nothing. The state machine's own controls —
// start, complete, cancel, reopen, archive (REQ-SES-003, REQ-SES-005,
// REQ-SES-012) — are STORY-SES-002, and scheduling is SCR-043.
//
// Owned by `sessions` for wave 1 only; handed to `console` at wave 3
// (DEC-042). Admin only, 404 for everyone else — see listSessionsForAdmin().

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [sessions, ready, categories, members, prefs, t] = await Promise.all([
    listSessionsForAdmin(locale),
    listSchedulableProposals(locale),
    listCategories(locale),
    listNameableMembers(locale),
    getOrgPrefs(locale),
    getTranslations("admin.sessions"),
  ]);
  if (sessions === null) notFound();

  const num = (n: number) => formatNumber(n, prefs.numerals);

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      <section aria-labelledby="ready" className="mt-10 max-w-3xl">
        <h2 id="ready" className="text-h2 text-fg-heading">
          {t("readyTitle")}
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">{t("readyIntro")}</p>
        {ready.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("readyEmpty")}</p>
        ) : (
          <>
            <p className="mt-2 text-body-sm text-fg-muted">{t("readyCount", { count: ready.length, value: num(ready.length) })}</p>
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
          </>
        )}
      </section>

      <section aria-labelledby="direct" className="mt-12 max-w-3xl border-t border-edge pt-8">
        <h2 id="direct" className="text-h2 text-fg-heading">
          {t("directTitle")}
        </h2>
        <p className="mt-2 text-body-sm text-fg-muted">{t("directIntro")}</p>
        <DirectSessionForm action={makeSessionDirectly.bind(null, locale as Locale)} categories={categories} members={members} />
      </section>

      <section aria-labelledby="all" className="mt-12 max-w-3xl border-t border-edge pt-8">
        <h2 id="all" className="text-h2 text-fg-heading">
          {t("listTitle")}
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-3 text-body text-fg-body">{t("listEmpty")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => {
              const declined = s.presenters.some((p) => p.declinedAt !== null);
              const pending = s.presenters.some((p) => !p.accepted && p.declinedAt === null);
              return (
                <li key={s.id} className="rounded-field border border-edge p-4">
                  <Link href={`/app/sessions/${s.id}`} className="text-label text-fg-heading underline underline-offset-4">
                    <bdi>{s.title}</bdi>
                  </Link>
                  <p className="mt-1 text-body-sm text-fg-muted">
                    {t(`state.${s.state}`)} · {s.startsAt ? <bdi>{formatDateTime(s.startsAt, prefs.numerals, prefs.timeZone, locale)}</bdi> : t("notScheduled")} ·{" "}
                    {s.fromProposal ? t("fromProposal") : t("directBadge")}
                    {declined ? ` · ${t("presenterDeclined")}` : pending ? ` · ${t("presenterPending")}` : ""}
                  </p>
                  <p className="mt-2 text-body-sm">
                    <Link href={`/app/admin/sessions/${s.id}/schedule`} className="text-fg-heading underline underline-offset-4">
                      {t("schedule")}
                    </Link>
                  </p>
                  {/* REQ-SES-005: start, complete, cancel, archive, reopen —
                      only the edges 02 §6.2 allows from this state. */}
                  <SessionControls action={runTransition.bind(null, locale as Locale, s.id)} actions={actionsFor(s.state)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
