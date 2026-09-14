"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";
import type { SearchFilterOptions } from "@/lib/dal/search";

// REQ-DSC-005: "Filters combine, and the active set is visible and
// clearable." This component owns no results of its own — it only reads
// and writes the URL's own query string (`q`, `category`, `venue`,
// `company`, `level`, `language`, `presenter`, `from`, `to`); the browse
// page reads those same param names and calls `searchSessions()`
// (src/lib/dal/search.ts) with them. Mobile/desktop placement (bottom
// sheet vs. an inline-start rail, 09 §SCR-011) is the page's own layout
// concern, not this component's — it renders as one column either way.

const PARAM_KEYS = ["q", "category", "venue", "company", "level", "language", "presenter", "from", "to"] as const;
type ParamKey = (typeof PARAM_KEYS)[number];

interface FiltersFormProps {
  options: SearchFilterOptions;
}

export function FiltersForm({ options }: FiltersFormProps) {
  const t = useTranslations("search.filters");
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

  function removeFilter(key: ParamKey) {
    const next = Object.fromEntries(PARAM_KEYS.map((k) => [k, k === key ? "" : currentValue(k)])) as Record<ParamKey, string>;
    applyParams(next);
  }

  const activeChips = PARAM_KEYS.map((key) => ({ key, value: currentValue(key) })).filter((c) => c.value);

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-field border border-edge p-4">
        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("queryLabel")}
          <input name="q" defaultValue={currentValue("q")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
        </label>

        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("categoryLabel")}
          <select name="category" defaultValue={currentValue("category")} className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
            <option value="">{t("any")}</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("venueLabel")}
          <select name="venue" defaultValue={currentValue("venue")} className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
            <option value="">{t("any")}</option>
            {options.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("companyLabel")}
          <select name="company" defaultValue={currentValue("company")} className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
            <option value="">{t("any")}</option>
            {options.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("levelLabel")}
          <select name="level" defaultValue={currentValue("level")} className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
            <option value="">{t("any")}</option>
            <option value="introductory">{t("level.introductory")}</option>
            <option value="intermediate">{t("level.intermediate")}</option>
            <option value="advanced">{t("level.advanced")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("languageLabel")}
          <select name="language" defaultValue={currentValue("language")} className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
            <option value="">{t("any")}</option>
            <option value="ar">{t("language.ar")}</option>
            <option value="en">{t("language.en")}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-body-sm text-fg-body">
          {t("presenterLabel")}
          <input name="presenter" defaultValue={currentValue("presenter")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-body-sm text-fg-body">
            {t("dateFromLabel")}
            <input type="date" name="from" defaultValue={currentValue("from")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-body-sm text-fg-body">
            {t("dateToLabel")}
            <input type="date" name="to" defaultValue={currentValue("to")} className="rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body text-fg-heading" />
          </label>
        </div>

        <button type="submit" className="self-start rounded-field border border-edge-strong px-4 py-2 text-label text-fg-heading">
          {t("apply")}
        </button>
      </form>

      {activeChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => removeFilter(chip.key)}
              className="rounded-field border border-edge-strong px-3 py-1 text-body-sm text-fg-body hover:text-fg-heading"
            >
              <bdi>{chip.value}</bdi> ×
            </button>
          ))}
          <button type="button" onClick={() => applyParams(Object.fromEntries(PARAM_KEYS.map((k) => [k, ""])) as Record<ParamKey, string>)} className="text-body-sm text-fg-body underline hover:text-fg-heading">
            {t("clearAll")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
