"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import { ChevronIcon } from "@/components/ui/icons";
import { Menu } from "@/components/ui/menu";
import type { MenuItem } from "@/components/ui";
import type { AuditFilters } from "@/lib/dal/admin-audit";
import { AUDIT_PATH, AUDIT_PERIOD_CHOICES, auditHref, auditWithout } from "./audit-query";

// SCR-062's toolbar, written for wave 22 from `AdminAudit.dc.html`: the chips — الفاعل (an admin's only), الفعل, the
// period, and العنصر when a subject is followed — each carrying its value, and the count. Every choice is a LINK, so a
// filtered log is a URL an admin can send and the toolbar needs no script (`042`'s shape). «مدة مخصّصة» opens its two
// date-only pickers in a GET form under the chips, the org's own days (`REQ-ADM-018`, wave 8's K1).
//
// ★ The artboard's free-text «بحث» is not built: `REQ-ADM-018` asks for actor, subject, action and date range, which
// the chips are, and a search over evidence would need an index nothing has (D13, carried to the lead).

export interface AuditToolbarChoices {
  actors: { id: string; label: string }[] | null;
  actionGroups: { label: string; actions: { value: string; label: string }[] }[];
  subjectTypes: { value: string; label: string }[];
}

export function AuditToolbar({
  filters,
  choices,
  count,
  labels,
}: {
  filters: AuditFilters;
  choices: AuditToolbarChoices;
  count: string;
  labels: { actor: string | null; action: string | null; subject: string | null };
}) {
  const t = useTranslations("admin.audit");
  const any = t("any");
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
  const base = (keys: (keyof AuditFilters)[]) => auditWithout(filters, ...keys);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* One row of chips that scrolls on its own on a phone — the page never does. */}
        <nav aria-label={t("filtersLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {choices.actors
            ? chip(t("filterActor", { value: labels.actor ?? any }), [
                { label: any, href: auditHref(base(["actor"])), current: !filters.actor },
                { label: t("systemActor"), href: auditHref({ ...base(["actor"]), actor: "system" }), current: filters.actor === "system" },
                ...choices.actors.map((a) => ({ label: a.label, href: auditHref({ ...base(["actor"]), actor: a.id }), current: filters.actor === a.id })),
              ])
            : null}
          {chip(t("filterAction", { value: labels.action ?? any }), [
            { label: any, href: auditHref(base(["action"])), current: !filters.action },
            ...choices.actionGroups.flatMap((group) => [
              { label: group.label, disabled: true, startsGroup: true },
              ...group.actions.map((a) => ({ label: a.label, href: auditHref({ ...base(["action"]), action: a.value }), current: filters.action === a.value })),
            ]),
          ])}
          {chip(t("filterPeriod", { value: filters.period ? t(`periods.${filters.period}`) : t("periods.all") }), [
            { label: t("periods.all"), href: auditHref(base(["period", "from", "to"])), current: !filters.period },
            ...AUDIT_PERIOD_CHOICES.map((p) => ({ label: t(`periods.${p}`), href: auditHref({ ...base(["period", "from", "to"]), period: p }), current: filters.period === p })),
          ])}
          {chip(t("filterSubject", { value: labels.subject ?? any }), [
            { label: any, href: auditHref(base(["subjectType", "subjectId"])), current: !filters.subjectType && !filters.subjectId },
            ...choices.subjectTypes.map((s) => ({ label: s.label, href: auditHref({ ...base(["subjectType", "subjectId"]), subjectType: s.value }), current: filters.subjectType === s.value && !filters.subjectId })),
          ])}
        </nav>
        <p className="shrink-0 text-caption text-fg-muted">{count}</p>
      </div>

      {filters.period === "custom" ? (
        <form method="get" action={AUDIT_PATH} aria-label={t("customRange")} className="flex flex-col gap-3 rounded-card border border-edge p-4 md:flex-row md:items-end">
          {filters.actor ? <input type="hidden" name="actor" value={filters.actor} /> : null}
          {filters.action ? <input type="hidden" name="action" value={filters.action} /> : null}
          {filters.subjectType ? <input type="hidden" name="subject" value={filters.subjectType} /> : null}
          {filters.subjectId ? <input type="hidden" name="subjectId" value={filters.subjectId} /> : null}
          <input type="hidden" name="period" value="custom" />
          <Field id="audit-from" label={t("dateFromLabel")}>
            <DateTime name="from" label={t("dateFromLabel")} granularity="date" defaultValue={filters.from ?? null} max={filters.to} />
          </Field>
          <Field id="audit-to" label={t("dateToLabel")} hint={t("dateToHint")}>
            <DateTime name="to" label={t("dateToLabel")} granularity="date" defaultValue={filters.to ?? null} min={filters.from} />
          </Field>
          <Button type="submit" variant="secondary" size="md">
            {t("apply")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
