"use client";

import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { TIMELINE_PERIODS } from "@/components/browse/timeline-groups";
import {
  LEGACY_DATE_KEYS,
  SHEET_KEYS,
  getFilter,
  parseTimelineQuery,
  timelineHref,
  withFilter,
  withoutFilter,
  type FilterKey,
  type TimelineQuery,
} from "@/components/browse/timeline-query";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon, FilterIcon } from "@/components/ui/icons";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";

// «المزيد من عوامل التصفية» — REQ-UIX-022, REQ-DSC-005, `16` §6.2.
//
// Everything that is not a row-A toggle lives here: the period, the tag, the
// venue, the company, the presenter, the level, the spoken language. Below `md`
// it is a bottom sheet — the list is never pushed sideways — and from `md` a
// sheet at the inline end, so on no width does a rail compete with the one
// column.
//
// ★ IT EDITS THE URL AND NOTHING ELSE. «اعرض النتائج» applies the sheet's keys
// to the current query — changed ones become the most recent, untouched ones
// keep their place, the status, the category and the search are left alone —
// and navigates to `/app/sessions?…`, the canonical address, from `/app` too
// (DEC-130). «امسح» drops only the sheet's own keys.

export interface FilterSheetProps {
  /** The query as the server parsed it, serialised so it crosses to the client as a string. */
  search: string;
  options: {
    venues: { id: string; name: string }[];
    companies: { id: string; name: string }[];
    tags: { label: string; normalised: string; count: number }[];
    presenters: string[];
  };
}

// Which edge the sheet opens from follows the width, read without a hydration
// mismatch: the server and the first client render say "bottom".
const MD = "(min-width: 768px)";
const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
const subscribe = (notify: () => void) => {
  if (!hasMatchMedia()) return () => {};
  const mq = window.matchMedia(MD);
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
};
const isWide = () => hasMatchMedia() && window.matchMedia(MD).matches;

export function FilterSheet({ search, options }: FilterSheetProps) {
  const t = useTranslations("browse.filters");
  const tf = useTranslations("search.filters");
  const tc = useTranslations("browse.card");
  const tg = useTranslations("browse.timeline.groups");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wide = useSyncExternalStore(subscribe, isWide, () => false);
  // ★ The push runs in a tracked transition, so the results re-rendering is
  // visible as a busy state. The sheet has closed by then, so the busy state
  // is on the button that opened it.
  const [pending, startTransition] = useTransition();

  const query = parseTimelineQuery(new URLSearchParams(search));
  // A saved link's `from`/`to` still counts, and «امسح» still clears it.
  const applied = [...SHEET_KEYS, ...LEGACY_DATE_KEYS].filter((key) => getFilter(query, key) !== undefined).length;
  const value = (key: FilterKey) => getFilter(query, key) ?? "";

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let next: TimelineQuery = query;
    for (const key of SHEET_KEYS) {
      const submitted = String(form.get(key) ?? "").trim();
      if (submitted === (getFilter(query, key) ?? "")) continue;
      next = submitted ? withFilter(next, key, submitted) : withoutFilter(next, key);
    }
    // A period chosen here replaces a date range from an old link — the two
    // would contradict each other, and only one of them has a control.
    if (getFilter(next, "when") !== undefined) next = LEGACY_DATE_KEYS.reduce<TimelineQuery>((q, key) => withoutFilter(q, key), next);
    setOpen(false);
    startTransition(() => router.push(timelineHref(next)));
  }

  function reset() {
    const next = [...SHEET_KEYS, ...LEGACY_DATE_KEYS].reduce<TimelineQuery>((q, key) => withoutFilter(q, key), query);
    setOpen(false);
    startTransition(() => router.push(timelineHref(next)));
  }

  return (
    <>
      {/* The count is drawn as a figure and SPOKEN as words: the name starts
          with the visible label (SC 2.5.3) and adds «عاملان مطبّقان». */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        iconStart={<FilterIcon />}
        pending={pending}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={applied > 0 ? `${t("more")}، ${t("applied", { count: applied, value: formatNumber(applied) })}` : undefined}
      >
        {t("more")}
        {applied > 0 ? (
          <span aria-hidden="true" className="ms-1 rounded-field bg-silver-100 px-1.5 text-caption text-fg-heading">
            {formatNumber(applied)}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen} title={t("sheet.title")} side={wide ? "inline-end" : "bottom"}>
        <form onSubmit={apply} className="flex flex-col gap-5">
          {/* ★ Periods, not a date range (DEC-098, DEC-141 ruling 15). A native
              <input type="date"> draws the BROWSER's mask — `dd/mm/yyyy` in
              English under this Arabic page, measured — and a browser set to
              Arabic may draw Arabic-Indic digits (DEC-124). The three periods
              are the timeline's own date groups, so a filter and a heading say
              the same thing. */}
          <RadioGroup
            name="when"
            legend={t("when")}
            defaultValue={value("when")}
            options={[{ value: "", label: tf("any") }, ...TIMELINE_PERIODS.map((period) => ({ value: period, label: tg(period) }))]}
          />

          {options.tags.length > 0 ? (
            <Field label={tf("tagLabel")}>
              <Select name="tag" defaultValue={value("tag")}>
                <option value="">{tf("any")}</option>
                {options.tags.map((tag) => (
                  <option key={tag.normalised} value={tag.normalised}>
                    {`${tag.label} (${tag.count})`}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label={tf("venueLabel")}>
            <Select name="venue" defaultValue={value("venue")}>
              <option value="">{tf("any")}</option>
              {options.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={tf("companyLabel")}>
            <Select name="company" defaultValue={value("company")}>
              <option value="">{tf("any")}</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          {options.presenters.length > 0 ? (
            <Field label={tf("presenterLabel")}>
              <Select name="presenter" defaultValue={value("presenter")}>
                <option value="">{tf("any")}</option>
                {options.presenters.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <RadioGroup
            name="level"
            legend={tf("levelLabel")}
            defaultValue={value("level")}
            options={[
              { value: "", label: tf("any") },
              { value: "introductory", label: tc("level.introductory") },
              { value: "intermediate", label: tc("level.intermediate") },
              { value: "advanced", label: tc("level.advanced") },
            ]}
          />

          <RadioGroup
            name="language"
            legend={tf("languageLabel")}
            defaultValue={value("language")}
            options={[
              { value: "", label: tf("any") },
              { value: "ar", label: tc("language.ar") },
              { value: "en", label: tc("language.en") },
            ]}
          />

          {/* ★ Sticky at the sheet's bottom edge: on a phone the fields run past the
              first screen, and «اعرض النتائج» must not be below the fold. */}
          <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-edge bg-[var(--color-canvas)] px-5 py-3">
            <Button type="submit" size="md">
              {t("sheet.apply")}
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={reset}>
              {t("sheet.reset")}
            </Button>
            <IconButton label={t("sheet.close")} className="ms-auto" onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </div>
        </form>
      </Sheet>
    </>
  );
}
