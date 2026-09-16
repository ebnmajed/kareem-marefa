"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";

// SCR-043's carried-over item (DEC-045, console.md): a native
// `datetime-local` renders its calendar and placeholder in the BROWSER's
// own locale, which a page's own `dir="rtl"` cannot reach — the widget is
// OS-drawn, outside CSS. This is a fully custom picker instead: every pixel
// of it is ordinary DOM content, so it inherits the page's direction the
// same way any other component does, and its digits follow the org's own
// numeral system rather than the browser's.
//
// The value contract is unchanged from the native input it replaces: a
// hidden field named `name` carries "YYYY-MM-DDTHH:mm" — the exact string
// `datetime-local` produced and `schedule/actions.ts`'s `atZone()` already
// parses. Nothing downstream of this component changes.
//
// Week starts Sunday (the Gulf convention `Asia/Riyadh`'s org default
// implies) — not derived from `Intl.Locale().weekInfo`, which is not yet
// reliably available across the runtimes this product targets.

export interface RtlDateTimePickerProps {
  id: string;
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** "YYYY-MM-DDTHH:mm", or "" for unset. */
  defaultValue: string;
  locale: string;
  clearLabel: string;
  todayLabel: string;
  doneLabel: string;
  hourLabel: string;
  minuteLabel: string;
  emptyLabel: string;
  /** The month-navigation buttons carry only a chevron, so their name is
   *  this label (WCAG 4.1.2) — M9's axe assertion found them unnamed. */
  prevMonthLabel: string;
  nextMonthLabel: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function parse(value: string): { y: number; m: number; d: number; h: number; min: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]), h: Number(match[4]), min: Number(match[5]) };
}

function serialize(y: number, m: number, d: number, h: number, min: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}T${pad(h)}:${pad(min)}`;
}

export function RtlDateTimePicker({
  id,
  name,
  label,
  hint,
  required,
  defaultValue,
  locale,
  clearLabel,
  todayLabel,
  doneLabel,
  hourLabel,
  minuteLabel,
  emptyLabel,
  prevMonthLabel,
  nextMonthLabel,
}: RtlDateTimePickerProps) {
  const parsed = parse(defaultValue);
  const now = new Date();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.y ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? now.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const num = (n: number) => formatNumber(n);

  const displayText = useMemo(() => {
    const p = parse(value);
    if (!p) return emptyLabel;
    const nu = "latn";
    return new Intl.DateTimeFormat(`${locale}-u-nu-${nu}`, { dateStyle: "long", timeStyle: "short" }).format(new Date(p.y, p.m, p.d, p.h, p.min));
  }, [value, locale, emptyLabel]);

  const monthLabel = useMemo(() => {
    const nu = "latn";
    return new Intl.DateTimeFormat(`${locale}-u-nu-${nu}`, { month: "long", year: "numeric" }).format(new Date(viewYear, viewMonth, 1));
  }, [viewYear, viewMonth, locale]);

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // A fixed week starting Sunday (2023-01-01 is a Sunday), independent of
    // the reader's own locale week-start guess.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
  }, [locale]);

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: { date: number; inMonth: boolean; y: number; m: number }[] = [];
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) cells.push({ date: prevDays - i, inMonth: false, y: viewMonth === 0 ? viewYear - 1 : viewYear, m: viewMonth === 0 ? 11 : viewMonth - 1 });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: d, inMonth: true, y: viewYear, m: viewMonth });
    while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ date: cells.length - startOffset - daysInMonth + 1, inMonth: false, y: viewMonth === 11 ? viewYear + 1 : viewYear, m: viewMonth === 11 ? 0 : viewMonth + 1 });
    return cells;
  }, [viewYear, viewMonth]);

  function commit(y: number, m: number, d: number, h: number, min: number) {
    setValue(serialize(y, m, d, h, min));
  }

  function pickDay(cell: { date: number; y: number; m: number }) {
    const p = parse(value);
    commit(cell.y, cell.m, cell.date, p?.h ?? 0, p?.min ?? 0);
    setViewYear(cell.y);
    setViewMonth(cell.m);
  }

  function setHour(h: number) {
    const p = parse(value) ?? { y: viewYear, m: viewMonth, d: now.getDate(), h: 0, min: 0 };
    commit(p.y, p.m, p.d, h, p.min);
  }
  function setMinute(min: number) {
    const p = parse(value) ?? { y: viewYear, m: viewMonth, d: now.getDate(), h: 0, min: 0 };
    commit(p.y, p.m, p.d, p.h, min);
  }

  const p = parse(value);

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Not a `<label htmlFor>` on the trigger: that association would make
          the trigger's ACCESSIBLE NAME the field label alone, always,
          discarding the current value a screen reader needs — the same
          class of bug as the check-in code boxes (09 SCR-014's own
          warning). `aria-label` combines both, updating with the value. */}
      <p id={`${id}-label`} className="text-label text-fg-heading">
        {label}
      </p>
      {hint ? <p className="mt-1 text-body-sm text-fg-muted">{hint}</p> : null}
      <input type="hidden" id={id} name={name} value={value} />
      <button
        id={`${id}-trigger`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${label}: ${displayText}`}
        onClick={() => setOpen((o) => !o)}
        className="mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-start text-body text-fg-heading"
      >
        <bdi aria-hidden="true">{displayText}</bdi>
      </button>

      {open ? (
        <div id={popoverId} role="dialog" aria-label={label} className="absolute z-20 mt-2 w-80 max-w-[90vw] rounded-field border border-edge-strong bg-canvas p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <button type="button" onClick={goPrevMonth} aria-label={prevMonthLabel} className="inline-flex h-9 w-9 items-center justify-center rounded-field hover:bg-silver-100">
              <ChevronIcon direction="back" />
            </button>
            <p className="text-label text-fg-heading">
              <bdi>{monthLabel}</bdi>
            </p>
            <button type="button" onClick={goNextMonth} aria-label={nextMonthLabel} className="inline-flex h-9 w-9 items-center justify-center rounded-field hover:bg-silver-100">
              <ChevronIcon direction="forward" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-body-sm text-fg-muted">
            {weekdayNames.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((cell, i) => {
              const selected = p !== null && p.y === cell.y && p.m === cell.m && p.d === cell.date;
              // A leading/trailing padding cell can share its bare day
              // number with an in-month day elsewhere in the same 42-cell
              // grid (e.g. a 30-day month with a 2-day lead reaches ten
              // days into next month) — the full date disambiguates both
              // for a screen reader and for anything that queries by name.
              const nu = "latn";
              const fullDate = new Intl.DateTimeFormat(`${locale}-u-nu-${nu}`, { day: "numeric", month: "long", year: "numeric" }).format(new Date(cell.y, cell.m, cell.date));
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!cell.inMonth}
                  aria-label={fullDate}
                  onClick={() => pickDay(cell)}
                  className={`h-9 rounded-field text-body-sm ${selected ? "bg-navy-950 text-white" : cell.inMonth ? "text-fg-heading hover:bg-silver-100" : "text-fg-muted/40"}`}
                >
                  <span aria-hidden="true">{num(cell.date)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3 border-t border-edge pt-4">
            <label className="flex items-center gap-2 text-body-sm text-fg-heading">
              {hourLabel}
              <select value={p?.h ?? 0} onChange={(e) => setHour(Number(e.target.value))} dir="ltr" className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {num(h)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-body-sm text-fg-heading">
              {minuteLabel}
              <select value={p?.min ?? 0} onChange={(e) => setMinute(Number(e.target.value))} dir="ltr" className="rounded-field border border-edge-strong bg-canvas px-2 py-1 text-body-sm text-fg-heading">
                {Array.from({ length: 60 }, (_, m) => m).filter((m) => m % 5 === 0 || m === (p?.min ?? 0)).map((m) => (
                  <option key={m} value={m}>
                    {num(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const p2 = parse(value);
                commit(now.getFullYear(), now.getMonth(), now.getDate(), p2?.h ?? 12, p2?.min ?? 0);
                setViewYear(now.getFullYear());
                setViewMonth(now.getMonth());
              }}
              className="text-body-sm text-fg-body underline hover:text-fg-heading"
            >
              {todayLabel}
            </button>
            {!required ? (
              <button
                type="button"
                onClick={() => setValue("")}
                className="text-body-sm text-fg-body underline hover:text-fg-heading"
              >
                {clearLabel}
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className="ms-auto inline-flex h-10 items-center rounded-field bg-navy-950 px-5 text-body-sm text-white hover:bg-navy-900">
              {doneLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
