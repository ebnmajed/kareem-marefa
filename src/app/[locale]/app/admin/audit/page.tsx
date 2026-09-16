import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KeysetPager } from "@/components/admin/keyset-pager";
import { formatNumber } from "@/components/sessions/numerals";
import type { EmptyStateProps } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { TagChip } from "@/components/ui/tag-chip";
import { auditFiltersFrom, listAuditFilterOptions, listAuditLog, type AuditFilters } from "@/lib/dal/admin-audit";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import { AuditFilterPanel, type AuditFilterChoices } from "./audit-filters";
import { AuditTable, type AuditTableRow } from "./audit-table";

// SCR-062 · /app/admin/audit (REQ-ADM-018), on the M9 system for wave 8 (K1).
// Staff — an admin sees the whole org's log, a moderator sees only their own
// actions (`audit_read_admin`/`audit_read_moderator_own`, 0004, 03 §5.10a);
// `listAuditLog()` adds no role filter of its own, RLS pre-scopes the same
// query for either role. A plain member gets the streamed not-found (DEC-134).
//
// Searchable by actor, subject, action and date range — the date range in
// the org's own days (`lib/dal/admin-audit.ts` says why that was wrong
// before) — a page of fifty at a time with a way to the older ones, every
// action and subject in Arabic, and one subject followable from any row.
// Nothing here edits a row: the log is evidence.
//
// ★ `REQ-ADM-018` lists «scoring configuration changes» among what the log
// holds; those are written to `scoring_config_history`, which the points
// screen reads — the admin is told so, with the link, rather than shown a log
// that looks complete and is not.

const PATH = "/app/admin/audit";
const PARAM: Record<keyof AuditFilters, string> = {
  actor: "actor",
  action: "action",
  subjectType: "subject",
  subjectId: "subjectId",
  period: "period",
  from: "from",
  to: "to",
  before: "before",
};

function href(filters: AuditFilters): string {
  const query = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAM) as [keyof AuditFilters, string][]) {
    const value = filters[key];
    if (value) query.set(param, value);
  }
  const qs = query.toString();
  return qs ? `${PATH}?${qs}` : PATH;
}

const domainOf = (action: string) => {
  const domain = action.split(".")[0];
  return domain === "check_in_code" ? "check_in" : domain;
};

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
  const [page, options] = await Promise.all([listAuditLog(locale, filters, prefs.timeZone), listAuditFilterOptions(locale)]);
  if (page === null || options === null) notFound();

  const isAdmin = session.role === "admin";
  const actionLabel = (action: string) => {
    const key = `actions.${action}`;
    return t.has(key) ? t(key) : action;
  };
  const subjectLabel = (type: string) => (t.has(`subjects.${type}`) ? t(`subjects.${type}`) : type);
  const domainLabel = (domain: string) => (t.has(`domains.${domain}`) ? t(`domains.${domain}`) : t("domains.other"));

  const groups = new Map<string, { value: string; label: string }[]>();
  for (const action of options.actions) {
    const group = domainLabel(domainOf(action));
    groups.set(group, [...(groups.get(group) ?? []), { value: action, label: actionLabel(action) }]);
  }
  const choices: AuditFilterChoices = {
    actors: options.actors?.map((a) => ({ id: a.id, label: a.displayName ?? t("unknownActor") })) ?? null,
    actionGroups: Array.from(groups, ([label, actions]) => ({ label, actions: actions.sort((a, b) => a.label.localeCompare(b.label, "ar")) })).sort((a, b) =>
      a.label.localeCompare(b.label, "ar"),
    ),
    subjectTypes: options.subjectTypes.map((value) => ({ value, label: subjectLabel(value) })),
  };

  const rows: AuditTableRow[] = page.rows.map((r) => ({
    id: r.id,
    action: r.action,
    actionLabel: actionLabel(r.action),
    actorName: r.actorName,
    actorRole: r.actorRole,
    isSystem: r.actorId === null,
    subjectLabel: r.subjectType ? subjectLabel(r.subjectType) : null,
    subjectHref: r.subjectType && r.subjectId && r.subjectId !== filters.subjectId ? href({ subjectType: r.subjectType, subjectId: r.subjectId }) : null,
    reason: r.reason,
    occurredAt: r.occurredAt,
  }));

  // The chips: each active filter, removable on its own. Removing the period
  // removes its dates; every removal starts again from the newest rows.
  const chip = (name: string, value: string) => t.markup("chip", { name, value, t: (chunks) => chunks, bdi: (chunks) => chunks });
  const without = (...keys: (keyof AuditFilters)[]) => {
    const next: AuditFilters = { ...filters, before: undefined };
    for (const key of keys) next[key] = undefined;
    return href(next);
  };
  const actorName = filters.actor === "system" ? t("systemActor") : choices.actors?.find((a) => a.id === filters.actor)?.label;
  const chips = [
    filters.actor && actorName ? { label: chip(t("actorLabel"), actorName), removeHref: without("actor") } : null,
    filters.action ? { label: chip(t("actionLabel"), actionLabel(filters.action)), removeHref: without("action") } : null,
    filters.subjectType ? { label: chip(t("subjectTypeLabel"), subjectLabel(filters.subjectType)), removeHref: without("subjectType", "subjectId") } : null,
    filters.subjectId && !filters.subjectType ? { label: t("oneSubject"), removeHref: without("subjectId") } : null,
    filters.subjectId && filters.subjectType ? { label: chip(t("colSubject"), t("oneSubject")), removeHref: without("subjectId") } : null,
    filters.period ? { label: chip(t("periodLabel"), t(`periods.${filters.period}`)), removeHref: without("period", "from", "to") } : null,
  ].filter((c): c is { label: string; removeHref: string } => c !== null);
  const filtered = chips.length > 0;

  const empty: EmptyStateProps = filtered
    ? {
        title: t("emptyFilteredTitle"),
        description: t("emptyFilteredDescription"),
        action: { label: t("clearAll"), href: PATH },
      }
    : isAdmin
      ? { title: t("emptyTitle"), description: t("emptyDescription"), action: { label: t("toDashboard"), href: "/app/admin" } }
      : { title: t("emptyModeratorTitle"), description: t("emptyModeratorDescription"), action: { label: t("toModeration"), href: "/app/admin/moderation/comments" } };

  return (
    <>
      <PageHeader title={t("title")} description={t(isAdmin ? "introAdmin" : "introModerator")} />
      {isAdmin ? (
        <p className="mt-2 max-w-2xl text-body-sm text-fg-muted">
          {t("scoringNote")}{" "}
          <Link href="/app/admin/scoring#history-heading" className="text-fg-heading underline underline-offset-4">
            {t("scoringNoteLink")}
          </Link>
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
        <AuditFilterPanel choices={choices} filters={filters} activeCount={chips.length} />

        <div className="min-w-0 flex-1">
          {rangeInverted ? (
            <Panel tone="error" className="mb-4">
              <p role="alert" className="text-body-sm text-fg-heading">
                {t("rangeInverted")}
              </p>
            </Panel>
          ) : null}

          {filtered ? (
            <div role="group" aria-label={t("activeFilters")} className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <TagChip key={c.removeHref} label={c.label} removeHref={c.removeHref} removeLabel={t.markup("removeFilter", { label: c.label, bdi: (chunks) => chunks })} />
              ))}
              <Link href={PATH} className="text-body-sm text-fg-heading underline underline-offset-4">
                {t("clearAll")}
              </Link>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <p className="mb-3 text-body-sm text-fg-muted">{t.rich("pageCaption", { count: rows.length, value: formatNumber(rows.length), bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
          ) : null}

          <AuditTable rows={rows} timeZone={prefs.timeZone} locale={locale} empty={empty} />

          <KeysetPager
            label={t("pagerLabel")}
            olderHref={page.nextBefore ? href({ ...filters, before: page.nextBefore }) : null}
            olderLabel={t("older")}
            newestHref={filters.before ? without() : null}
            newestLabel={t("newest")}
          />
        </div>
      </div>
    </>
  );
}
