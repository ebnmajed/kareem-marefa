"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import { Field } from "@/components/ui/field";
import { FilterIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useRouter } from "@/i18n/navigation";
import type { AuditFilters, AuditPeriod } from "@/lib/dal/admin-audit";

// SCR-062's filters (REQ-ADM-018: «searchable by actor, subject, action and
// date range»). The URL is the state — a filtered log is a link an admin can
// send — so applying pushes a query and the page reads it; nothing here holds
// results.
//
// On a phone the form lives in `ui/sheet` behind «تصفية», which carries how
// many filters are on; from `md` it sits beside the log in a panel. Two
// instances of one form, never two forms: each takes an id prefix so their
// fields never share an id while the sheet is open over the panel.
//
// The date range is a period — the last seven days, thirty, this month — with
// «مدة مخصّصة» opening two date-only pickers (`ui/date-time`, never the
// browser's English `dd/mm/yyyy`). Applying drops the page cursor: a new
// filter starts from the newest rows.

export interface AuditFilterChoices {
  actors: { id: string; label: string }[] | null;
  actionGroups: { label: string; actions: { value: string; label: string }[] }[];
  subjectTypes: { value: string; label: string }[];
}

const PATH = "/app/admin/audit";

function FilterFields({ idPrefix, choices, filters, onApplied }: { idPrefix: string; choices: AuditFilterChoices; filters: AuditFilters; onApplied?: () => void }) {
  const t = useTranslations("admin.audit");
  const router = useRouter();
  const [period, setPeriod] = useState<AuditPeriod | "all">(filters.period ?? "all");
  const [from, setFrom] = useState<string | null>(filters.from ?? null);
  const [to, setTo] = useState<string | null>(filters.to ?? null);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const key of ["actor", "action", "subject"]) {
      const value = String(data.get(key) ?? "");
      if (value) query.set(key, value);
    }
    // Following one subject is kept: its chip is how it is removed.
    if (filters.subjectId) query.set("subjectId", filters.subjectId);
    if (period !== "all") query.set("period", period);
    if (period === "custom") {
      if (from) query.set("from", from);
      if (to) query.set("to", to);
    }
    const qs = query.toString();
    router.push(qs ? `${PATH}?${qs}` : PATH);
    onApplied?.();
  }

  return (
    <form onSubmit={apply} noValidate className="space-y-4">
      {choices.actors ? (
        <Field id={`${idPrefix}-actor`} label={t("actorLabel")}>
          <Select name="actor" defaultValue={filters.actor ?? ""}>
            <option value="">{t("any")}</option>
            <option value="system">{t("systemActor")}</option>
            {choices.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field id={`${idPrefix}-action`} label={t("actionLabel")}>
        <Select name="action" defaultValue={filters.action ?? ""}>
          <option value="">{t("any")}</option>
          {choices.actionGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.actions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <Field id={`${idPrefix}-subject`} label={t("subjectTypeLabel")}>
        <Select name="subject" defaultValue={filters.subjectType ?? ""}>
          <option value="">{t("any")}</option>
          {choices.subjectTypes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field id={`${idPrefix}-period`} label={t("periodLabel")}>
        <Select value={period} onChange={(e) => setPeriod(e.target.value as AuditPeriod | "all")}>
          {(["all", "7d", "30d", "month", "custom"] as const).map((p) => (
            <option key={p} value={p}>
              {t(`periods.${p}`)}
            </option>
          ))}
        </Select>
      </Field>

      {period === "custom" ? (
        <div className="space-y-4">
          <Field id={`${idPrefix}-from`} label={t("dateFromLabel")}>
            <DateTime name="from" label={t("dateFromLabel")} granularity="date" value={from} onChange={setFrom} max={to ?? undefined} />
          </Field>
          <Field id={`${idPrefix}-to`} label={t("dateToLabel")} hint={t("dateToHint")}>
            <DateTime name="to" label={t("dateToLabel")} granularity="date" value={to} onChange={setTo} min={from ?? undefined} />
          </Field>
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="md" className="w-full">
        {t("apply")}
      </Button>
    </form>
  );
}

export function AuditFilterPanel({ choices, filters, activeCount }: { choices: AuditFilterChoices; filters: AuditFilters; activeCount: number }) {
  const t = useTranslations("admin.audit");
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <Button type="button" variant="secondary" size="md" iconStart={<FilterIcon />} onClick={() => setOpen(true)} aria-haspopup="dialog">
          {activeCount > 0 ? t.markup("openFiltersCount", { value: String(activeCount), bdi: (chunks) => chunks }) : t("openFilters")}
        </Button>
        <Sheet open={open} onOpenChange={setOpen} title={t("filtersTitle")}>
          <FilterFields idPrefix="audit-sheet" choices={choices} filters={filters} onApplied={() => setOpen(false)} />
        </Sheet>
      </div>
      <aside aria-labelledby="audit-filters-title" className="hidden md:block md:w-72 md:shrink-0">
        <Panel>
          <h2 id="audit-filters-title" className="text-label text-fg-heading">
            {t("filtersTitle")}
          </h2>
          <div className="mt-4">
            <FilterFields idPrefix="audit-panel" choices={choices} filters={filters} />
          </div>
        </Panel>
      </aside>
    </>
  );
}
