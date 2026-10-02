import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExportDownloadButton } from "@/components/admin/export-download-button";
import { KeysetPager } from "@/components/admin/keyset-pager";
import { actionText, fieldText, scopeText, subjectText, valueText, type AuditMessages } from "@/components/admin/audit/audit-text";
import { formatNumber } from "@/components/sessions/numerals";
import type { EmptyStateProps } from "@/components/ui";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { auditFiltersFrom, listAuditFeed, listAuditFilterOptions } from "@/lib/dal/admin-audit";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import ar from "@/messages/ar/admin.json";
import en from "@/messages/en/admin.json";
import { auditHref, auditParams, auditWithout } from "./audit-query";
import { AuditTable, type AuditTableRow } from "./audit-table";
import { AuditToolbar, type AuditToolbarChoices } from "./audit-toolbar";

// SCR-062 · /app/admin/audit (`REQ-ADM-018`, `REQ-ADM-023`, `REQ-UIX-099`, `REQ-NFR-006`), written for wave 22 from
// `AdminAudit.dc.html` (`DEC-208`: deleted first). The job: an admin answers «who changed this, when, and why» from
// one table — the log's actions and the configuration history side by side, marked by kind (`DEC-231` §4.3) —
// narrowed by actor, action, period and subject, and exported as «CSV» through the audited path.
//
// Staff, decided at the data: an admin reads the org's log and its configuration history; ★ a moderator reads their
// own actions and nothing else — no history, no actor chip, no CSV — exactly as before (`REQ-ADM-020`, `09`'s coverage:
// «SCR-062 (own actions)»); a member gets the streamed not-found (`DEC-134`). The layout never gates.
//
// Kept from wave 8 (K1): the org's own days for a range, half-open; fifty a page with a keyset cursor, never an offset;
// one subject followable; former staff and «النظام» filterable; every action in Arabic and never its key.

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { filters, rangeInverted } = auditFiltersFrom(await searchParams);

  const [session, prefs, t] = await Promise.all([requireSession(locale), getOrgPrefs(locale), getTranslations("admin.audit")]);
  const [page, options] = await Promise.all([listAuditFeed(locale, filters, prefs.timeZone), listAuditFilterOptions(locale)]);
  if (page === null || options === null) notFound();

  const isAdmin = session.role === "admin";
  const m = (locale === "en" ? en : ar).admin.audit as unknown as AuditMessages;
  const domainLabel = (action: string) => {
    const domain = action.split(".")[0] === "check_in_code" ? "check_in" : action.split(".")[0];
    return t.has(`domains.${domain}`) ? t(`domains.${domain}`) : t("domains.other");
  };

  const groups = new Map<string, { value: string; label: string }[]>();
  for (const action of options.actions) {
    const group = domainLabel(action);
    groups.set(group, [...(groups.get(group) ?? []), { value: action, label: actionText(m, action) }]);
  }
  const choices: AuditToolbarChoices = {
    actors: options.actors?.map((a) => ({ id: a.id, label: a.displayName ?? t("unknownActor") })) ?? null,
    actionGroups: [
      ...Array.from(groups, ([label, actions]) => ({ label, actions: actions.sort((a, b) => a.label.localeCompare(b.label, "ar")) })).sort((a, b) => a.label.localeCompare(b.label, "ar")),
      // ★ The configuration history's scopes, an admin's only — `config.<scope>` (`DEC-231` §4.3).
      ...((options.configScopes ?? []).length > 0
        ? [{ label: t("config.group"), actions: (options.configScopes ?? []).map((s) => ({ value: `config.${s}`, label: scopeText(m, s) })) }]
        : []),
    ],
    subjectTypes: options.subjectTypes.map((value) => ({ value, label: subjectText(m, value) })),
  };

  const rows: AuditTableRow[] = page.rows.map((r) =>
    r.kind === "log"
      ? {
          id: r.id,
          kind: "log",
          occurredAt: r.occurredAt,
          actorName: r.actorName,
          actorRole: r.actorRole,
          isSystem: r.actorId === null,
          action: actionText(m, r.action),
          detail: null,
          reason: r.reason,
          target: r.subjectType ? [subjectText(m, r.subjectType), r.subjectName].filter(Boolean).join(" · ") : null,
          targetHref: r.subjectType && r.subjectId && r.subjectId !== filters.subjectId ? auditHref({ subjectType: r.subjectType, subjectId: r.subjectId }) : null,
        }
      : {
          id: r.id,
          kind: "config",
          occurredAt: r.occurredAt,
          actorName: r.actorName,
          actorRole: r.actorId === null ? null : "admin",
          isSystem: r.actorId === null,
          action: `${scopeText(m, r.scope)} · ${fieldText(m, r.field)}`,
          detail: { from: valueText(m, r.oldValue), to: valueText(m, r.newValue) },
          reason: null,
          target: r.entityName ?? scopeText(m, r.scope),
          targetHref: r.entityId && r.entityId !== filters.subjectId ? auditHref({ subjectId: r.entityId }) : null,
        },
  );

  const actorLabel = filters.actor === "system" ? t("systemActor") : choices.actors?.find((a) => a.id === filters.actor)?.label ?? null;
  const filtered = Object.entries(filters).some(([k, v]) => k !== "before" && v);
  const empty: EmptyStateProps = filtered
    ? { title: t("emptyFilteredTitle"), description: t("emptyFilteredDescription"), action: { label: t("clearAll"), href: "/app/admin/audit" } }
    : isAdmin
      ? { title: t("emptyTitle"), description: t("emptyDescription"), action: { label: t("toDashboard"), href: "/app/admin" } }
      : { title: t("emptyModeratorTitle"), description: t("emptyModeratorDescription"), action: { label: t("toModeration"), href: "/app/admin/moderation/reports" } };
  const csvQuery = auditParams(auditWithout(filters)).toString();

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        description={isAdmin ? undefined : t("introModerator")}
        actions={
          isAdmin ? (
            <ExportDownloadButton
              href={`/api/admin/exports/audit${csvQuery ? `?${csvQuery}` : ""}`}
              fallbackName="audit.csv"
              label={t("csv")}
              accessibleName={t("csvLabel")}
              pendingLabel={t("csvPending")}
              doneLabel={t("csvDone")}
              failedLabel={t("csvFailed")}
            />
          ) : null
        }
      />

      <div className="mt-6 space-y-4">
        <AuditToolbar
          filters={filters}
          choices={choices}
          count={t.markup("count", { count: page.total, value: formatNumber(page.total), bdi: (chunks) => chunks })}
          labels={{
            actor: actorLabel,
            action: filters.action ? (filters.action.startsWith("config.") ? scopeText(m, filters.action.slice(7)) : actionText(m, filters.action)) : null,
            subject: filters.subjectId ? t("oneSubject") : filters.subjectType ? subjectText(m, filters.subjectType) : null,
          }}
        />

        {rangeInverted ? (
          <Panel tone="error">
            <p role="alert" className="text-body-sm text-fg-heading">
              {t("rangeInverted")}
            </p>
          </Panel>
        ) : null}

        <AuditTable rows={rows} timeZone={prefs.timeZone} locale={locale} empty={empty} />

        <KeysetPager
          label={t("pagerLabel")}
          olderHref={page.nextBefore ? auditHref({ ...filters, before: page.nextBefore }) : null}
          olderLabel={t("older")}
          newestHref={filters.before ? auditHref(auditWithout(filters)) : null}
          newestLabel={t("newest")}
        />
      </div>
    </>
  );
}
