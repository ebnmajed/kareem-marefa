"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

// SCR-062's filter form (REQ-ADM-018: "searchable by actor, subject,
// action and date range"). Same URL-state shape SCR-011's `<SearchFilters>`
// uses: this component owns only the URL's own query string, the page
// reads it and calls `listAuditLog()`.

const PARAM_KEYS = ["actor", "action", "subject", "from", "to"] as const;
type ParamKey = (typeof PARAM_KEYS)[number];

export interface AuditFilterOptions {
  actors: { id: string; displayName: string | null }[];
  actions: string[];
}

export function FilterForm({ options }: { options: AuditFilterOptions }) {
  const t = useTranslations("admin.audit");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function currentValue(key: ParamKey): string {
    return searchParams.get(key) ?? "";
  }

  function applyParams(next: Record<ParamKey, string>) {
    const params = new URLSearchParams();
    for (const key of PARAM_KEYS) if (next[key]) params.set(key, next[key]);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const next = Object.fromEntries(PARAM_KEYS.map((key) => [key, String(formData.get(key) ?? "").trim()])) as Record<ParamKey, string>;
    applyParams(next);
  }

  const hasFilters = PARAM_KEYS.some((k) => currentValue(k));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-field border border-edge p-4">
      {options.actors.length > 0 ? (
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("actorLabel")}
          <select name="actor" defaultValue={currentValue("actor")} className="rounded-field border border-edge-strong bg-canvas px-2 py-2 text-body-sm text-fg-heading">
            <option value="">{t("any")}</option>
            {options.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName ?? a.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("actionLabel")}
        <select name="action" defaultValue={currentValue("action")} className="rounded-field border border-edge-strong bg-canvas px-2 py-2 text-body-sm text-fg-heading">
          <option value="">{t("any")}</option>
          {options.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-body-sm text-fg-body">
        {t("subjectTypeLabel")}
        <input name="subject" defaultValue={currentValue("subject")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body-sm text-fg-heading" dir="ltr" />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-body-sm text-fg-body">
          {t("dateFromLabel")}
          <input type="date" name="from" defaultValue={currentValue("from")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body-sm text-fg-heading" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-body-sm text-fg-body">
          {t("dateToLabel")}
          <input type="date" name="to" defaultValue={currentValue("to")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body-sm text-fg-heading" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="inline-flex h-11 items-center rounded-field border border-edge-strong px-4 text-body-sm text-fg-heading hover:bg-silver-100">
          {t("apply")}
        </button>
        {hasFilters ? (
          <button type="button" onClick={() => applyParams({ actor: "", action: "", subject: "", from: "", to: "" })} className="text-body-sm text-fg-body underline hover:text-fg-heading">
            {t("clearAll")}
          </button>
        ) : null}
      </div>
    </form>
  );
}
