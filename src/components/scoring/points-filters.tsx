"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { Select } from "@/components/ui/select";

// SCR-022's filters — «كل الجلسات ▾» · «كل الشهور ▾» · «14 سطرًا» (`Points.dc.html`, `M10c.md` §2; wave 20,
// REQ-UIX-072, `05` §8). scoring's file.
//
// ★ A plain GET form, as it has always been: the filtered view is a real, shareable URL (`?session=…&month=…`), and
// without JavaScript the `<noscript>` button submits it. With JavaScript a change submits at once — the artboard draws
// no button. Each control is named for a screen reader by its own label, since the artboard draws none beside it.
// The options arrive from the server, labelled; nothing here formats a date or reads a catalogue.

export interface PointsFilterOption {
  value: string;
  label: string;
}

export function PointsFilters({
  sessions,
  months,
  session,
  month,
  labels,
  count,
  clear = null,
  className = "",
}: {
  sessions: PointsFilterOption[];
  months: PointsFilterOption[];
  session: string | null;
  month: string | null;
  labels: { session: string; month: string; allSessions: string; allMonths: string; submit: string; heading: string };
  /** «14 سطرًا» — already in words. */
  count: string;
  /** «مسح التصفية» while a filter is applied — a link to the unfiltered URL. */
  clear?: { label: string; href: string } | null;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submit = () => form.current?.requestSubmit();

  return (
    <form ref={form} method="get" role="search" aria-label={labels.heading} className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Select name="session" aria-label={labels.session} defaultValue={session ?? ""} onChange={submit} className="w-auto max-w-44 rounded-pill">
        <option value="">{labels.allSessions}</option>
        {sessions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select name="month" aria-label={labels.month} defaultValue={month ?? ""} onChange={submit} className="w-auto max-w-40 rounded-pill">
        <option value="">{labels.allMonths}</option>
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <noscript>
        <Button type="submit" variant="secondary" size="sm">
          {labels.submit}
        </Button>
      </noscript>
      {clear ? (
        <Link href={clear.href} className="text-caption text-fg-muted underline underline-offset-4 hover:text-fg-heading">
          {clear.label}
        </Link>
      ) : null}
      <span className="ms-auto text-caption text-fg-muted">{count}</span>
    </form>
  );
}
