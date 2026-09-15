import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime } from "@/components/sessions/numerals";
import { listAuditActions, listAuditLog, listStaffActors } from "@/lib/dal/admin-audit";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import { FilterForm } from "./filter-form";

// SCR-062 · /app/admin/audit (REQ-ADM-018). Staff — an admin sees the
// whole org's log, a moderator sees only their own actions
// (`audit_read_admin`/`audit_read_moderator_own`, 0004, 03 §5.10a) —
// `listAuditLog()` adds no role filter of its own; the same query comes
// back pre-scoped by RLS for either role.

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ actor?: string; action?: string; subject?: string; from?: string; to?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [entries, actors, actions, prefs, session, t] = await Promise.all([
    listAuditLog(locale, { actorId: sp.actor || undefined, action: sp.action || undefined, subjectType: sp.subject || undefined, dateFrom: sp.from || undefined, dateTo: sp.to || undefined }),
    listStaffActors(locale),
    listAuditActions(locale),
    getOrgPrefs(locale),
    requireSession(locale),
    getTranslations("admin.audit"),
  ]);
  if (entries === null || actions === null) notFound();

  const isAdmin = session.role === "admin";

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t(isAdmin ? "introAdmin" : "introModerator")}</p>

      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-start">
        <div className="md:w-72 md:shrink-0">
          <FilterForm options={{ actors: actors ?? [], actions }} />
        </div>

        <div className="min-w-0 flex-1">
          {entries.length === 0 ? (
            <p className="text-body text-fg-body">{t("empty")}</p>
          ) : (
            // REQ-NFR-007: a scrollable region is a keyboard stop (axe scrollable-region-focusable).
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("title")}>
              <table className="w-full min-w-[640px] text-start text-body-sm">
                <thead>
                  <tr className="border-b border-edge text-fg-muted">
                    <th scope="col" className="py-2 pe-4 text-start font-normal">
                      {t("colDate")}
                    </th>
                    <th scope="col" className="py-2 pe-4 text-start font-normal">
                      {t("colActor")}
                    </th>
                    <th scope="col" className="py-2 pe-4 text-start font-normal">
                      {t("colAction")}
                    </th>
                    <th scope="col" className="py-2 pe-4 text-start font-normal">
                      {t("colSubject")}
                    </th>
                    <th scope="col" className="py-2 text-start font-normal">
                      {t("colReason")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-edge">
                      <td className="min-w-0 py-2 pe-4 text-fg-body">
                        <bdi>{formatDateTime(e.occurredAt, prefs.numerals, prefs.timeZone, locale)}</bdi>
                      </td>
                      <td className="py-2 pe-4 text-fg-heading">
                        <bdi>{e.actorName ?? t("systemActor")}</bdi>
                      </td>
                      <td className="py-2 pe-4 text-fg-body">
                        <bdi dir="ltr">{e.action}</bdi>
                      </td>
                      <td className="py-2 pe-4 text-fg-body">{e.subjectType ? <bdi dir="ltr">{e.subjectType}</bdi> : t("noSubject")}</td>
                      <td className="py-2 text-fg-body">{e.reason ? <bdi>{e.reason}</bdi> : t("noReason")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
