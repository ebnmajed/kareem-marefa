"use client";

import { useTranslations } from "next-intl";
import { MEMBER_ROLE_FILTERS, membersHref, NO_COMPANY, type MemberQuery, type MemberRoleFilter } from "@/components/admin/members/member-query";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { ChevronIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import type { DataTableColumn, MenuItem } from "@/components/ui";
import type { ConsoleMemberRow, ConsoleMembers } from "@/lib/dal/admin-members";
import type { Locale } from "@/i18n/routing";
import { MemberRowMenu } from "./member-row-menu";

// SCR-049's table, written for wave 22 from `AdminMembers.dc.html` (`DEC-208`: deleted first): the toolbar — search,
// «الشركة» and «الدور» chips carrying their value, the count — then العضو · الشركة · الدور · المستوى · النقاط · ⋯ and
// the pager. The toolbar is a GET form and the chips and pager are links: the URL is the state, so a filtered list is
// a link and works without JS (`042`'s shape).
//
// ★ The role column is the role's badge for staff and for a deactivated member, plain «عضو» otherwise (the artboard);
// the words are `REQ-ADM-009`'s, not the artboard's (D9). ★ «آخر نشاط» is absent — nothing stores it (`DEC-232` §4).
// ★ The email is not drawn in the row — the board does not, and no requirement asks it of this row: `REQ-ADM-009`'s
// «a member's full record» is the profile (⋯ «عرض الملف الكامل», SCR-020's admin tier); the search still finds by
// email and the CSV still carries it (the lead's wave-22 ruling).
// The viewer's own row has no ⋯: self-demotion and self-deactivation have no path (`REQ-ADM-009`).

export function MembersTable({ data, query, selfId, timeZone, locale }: { data: ConsoleMembers; query: MemberQuery; selfId: string; timeZone: string; locale: string }) {
  const t = useTranslations("admin.members");

  const columns: DataTableColumn<ConsoleMemberRow>[] = [
    {
      key: "member",
      header: t("columnMember"),
      onCard: true,
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar memberId={m.id} displayName={m.displayName} src={m.avatarUrl} teamColor={m.teamColor} size={32} decorative />
          <div className="min-w-0">
            <p className="text-label text-fg-heading">
              <bdi>{m.displayName ?? m.email}</bdi>
            </p>
            {m.status === "deactivated" && m.deactivatedAt ? (
              <p className="mt-1 text-caption text-fg-muted">
                {t.rich("deactivatedNote", { date: formatDateTime(m.deactivatedAt, timeZone, locale), reason: m.deactivatedReason ?? "", bdi: (chunks) => <bdi>{chunks}</bdi> })}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "company",
      header: t("columnCompany"),
      onCard: true,
      cell: (m) => (m.companyName ? <bdi>{m.companyName}</bdi> : <span className="text-fg-muted">{t("noValue")}</span>),
    },
    {
      key: "role",
      header: t("columnRole"),
      onCard: true,
      cell: (m) =>
        m.status === "deactivated" ? (
          <Badge tone="neutral" outline size="sm">
            {t("statusDeactivated")}
          </Badge>
        ) : m.role === "member" ? (
          <span>{t("role.member")}</span>
        ) : (
          // Words, not colour: a role is not a status (`DEC-073`), so both staff roles wear the neutral tone.
          <Badge tone="neutral" size="sm">
            {t(`role.${m.role}`)}
          </Badge>
        ),
    },
    {
      key: "level",
      header: t("columnLevel"),
      onCard: true,
      cell: (m) => (m.levelName ? <bdi>{m.levelName}</bdi> : <span className="text-fg-muted">{t("noValue")}</span>),
    },
    { key: "points", header: t("columnPoints"), onCard: true, cell: (m) => <bdi>{formatNumber(m.points)}</bdi> },
    {
      key: "actions",
      header: t("columnActions"),
      align: "end",
      onCard: true,
      // A value, never `null`: the phone card renders this column's label whatever the cell returns (wave 7, sync 6).
      cell: (m) =>
        m.id === selfId ? (
          <span className="text-fg-muted">{t("noValue")}</span>
        ) : (
          <MemberRowMenu member={m} locale={locale as Locale} lastAdmin={m.role === "admin" && m.status === "active" && data.activeAdmins <= 1} />
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <Toolbar data={data} query={query} />
      <DataTable
        // The surface card at md+, as 042 and the boards draw every console table (the lead's wave-22 ruling); cards below.
        className="md:rounded-panel md:border md:border-edge md:bg-surface md:px-2 md:py-1"
        stickyHeader
        hiddenHeaders={["actions"]}
        label={t("tableLabel")}
        columns={columns}
        rows={data.rows}
        rowKey={(m) => m.id}
        empty={{ title: t("searchEmpty"), action: { label: t("clearFilters"), href: "/app/admin/members" } }}
      />
      <Pager data={data} query={query} />
    </div>
  );
}

/** Search · the two chips, each showing its value · the count. A GET form, so it works without JS. */
function Toolbar({ data, query }: { data: ConsoleMembers; query: MemberQuery }) {
  const t = useTranslations("admin.members");
  const all = t("filterAll");
  const roleLabel = (r: MemberRoleFilter) => (r === "deactivated" ? t("statusDeactivated") : t(`role.${r}`));
  const company = query.company === NO_COMPANY ? t("noCompany") : data.companies.find((c) => c.id === query.company)?.name;
  const chip = (label: string, items: MenuItem[]) => (
    <Menu
      trigger={
        <Button type="button" variant="secondary" size="sm" className="shrink-0" iconEnd={<ChevronIcon direction="down" aria-hidden />}>
          <bdi>{label}</bdi>
        </Button>
      }
      items={items}
    />
  );

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
        <form role="search" action="/app/admin/members" method="get" className="md:w-70">
          <Field id="members-search" label={<span className="sr-only">{t("searchLabel")}</span>}>
            <Input type="search" name="q" defaultValue={query.q} placeholder={t("searchPlaceholder")} startIcon={<SearchIcon aria-hidden />} />
          </Field>
          {query.company ? <input type="hidden" name="company" value={query.company} /> : null}
          {query.role ? <input type="hidden" name="role" value={query.role} /> : null}
        </form>
        {/* One row of chips that scrolls on its own on a phone — the page never does. */}
        <nav aria-label={t("filtersLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chip(t("filterCompany", { value: company ?? all }), [
            { label: all, href: membersHref(query, { company: null, page: 1 }), current: !query.company },
            ...data.companies.map((c) => ({ label: c.name, href: membersHref(query, { company: c.id, page: 1 }), current: query.company === c.id })),
            { label: t("noCompany"), href: membersHref(query, { company: NO_COMPANY, page: 1 }), current: query.company === NO_COMPANY, startsGroup: true },
          ])}
          {chip(t("filterRole", { value: query.role ? roleLabel(query.role) : all }), [
            { label: all, href: membersHref(query, { role: null, page: 1 }), current: !query.role },
            ...MEMBER_ROLE_FILTERS.map((r) => ({ label: roleLabel(r), href: membersHref(query, { role: r, page: 1 }), current: query.role === r })),
          ])}
        </nav>
      </div>
      <p className="shrink-0 text-caption text-fg-muted">{t.rich("count", { count: data.total, value: formatNumber(data.total), bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
    </div>
  );
}

/** «1 – 9 من 212» with السابقة / التالية. Links, so no JS is needed. */
function Pager({ data, query }: { data: ConsoleMembers; query: MemberQuery }) {
  const t = useTranslations("admin.members");
  if (data.total === 0) return null;
  const n = formatNumber;
  const prev = data.page > 1 ? membersHref(query, { page: data.page - 1 }) : null;
  const next = data.page < data.pageCount ? membersHref(query, { page: data.page + 1 }) : null;
  return (
    <nav aria-label={t("pagerLabel")} className="flex flex-wrap items-center justify-between gap-3 text-caption text-fg-muted">
      <p>
        <bdi>{t("pageRange", { from: n(data.from), to: n(data.to), total: n(data.total) })}</bdi>
      </p>
      {data.pageCount > 1 ? (
        <div className="flex gap-2">
          {prev ? (
            <ButtonLink href={prev} variant="secondary" size="sm">
              {t("previous")}
            </ButtonLink>
          ) : null}
          {next ? (
            <ButtonLink href={next} variant="secondary" size="sm">
              {t("next")}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
