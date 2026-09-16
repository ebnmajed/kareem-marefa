"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/ui/icons";
import { controlClass, describedIds, useFieldWiring } from "@/components/ui/field";
import { formatNumber } from "@/components/sessions/numerals";
import type { ComboboxOption, ComboboxProps } from "@/components/ui";

// `console`'s file — ★ PROMOTE AND GENERALISE, not build (`16` §4.2).
// `src/components/admin/member-picker.tsx` already was a searchable
// combobox: a filtered list, the listbox role, `useId` wiring, keyboard
// handling, built for SCR-053. This is that shape, generalised to the full
// ARIA 1.2 pattern (`aria-activedescendant` follows the highlighted option),
// with three things genuinely new — Arabic-normalised matching, multi-select
// with removable chips, and a shape general enough for the proposal form's
// co-presenter field (M10, `sessions`' track).
//
// `member-picker.tsx` now re-exports this file rather than duplicating it.
//
// ★ R2 (`sessions`, wave 8) — four fixes for a MEMBER-facing caller
// (`/app/propose`'s co-presenter field), found because this file had only
// ever been driven from an admin screen before:
//
// 1. The input no longer forces `dir="ltr"` — it was a copy-paste leftover
//    from a URL/date-shaped input elsewhere, and it left every Arabic name
//    typed and read left-to-right. Direction now inherits from the
//    document's own `Direction.Provider`, same as every other control.
// 2. It now reads `useFieldWiring()` (`ui/field.tsx`, `sessions`' file) —
//    `<Field>`'s hint and error reach `aria-describedby`, and
//    `aria-required`/`aria-invalid` are set, exactly like `ui/input.tsx`
//    already does. An explicit `invalid` prop still wins over the context,
//    same precedence rule `Input` documents.
// 3. The input's classes come from `controlClass()` (`ui/field.tsx`'s own
//    export), not a hard-coded string that never varied with `invalid` —
//    the whole point of `controlClass` existing at all.
// 4. Its own strings moved from `admin.combobox` to `ui.combobox` — a member
//    form must not pull in the admin message catalogue to render a text
//    field. `member-picker.tsx`'s OWN `resultsLabel` override is a
//    different, admin-scoped string and stays exactly where it was
//    (`admin.combobox.resultsCount`, the one key kept there — see that
//    file); only what THIS file reads for itself moved.

/** REQ-DSC-004 — the SAME transform `src/lib/dal/search.ts`'s `arNormalize()`
 *  applies (strip tashkeel/tatweel, fold alef/yaa/taa-marbuta, collapse
 *  whitespace), duplicated rather than imported: that module starts `import
 *  "server-only"`, which throws if pulled into a client bundle. The exact
 *  reasoning `src/components/sessions/numerals.ts:9` already gives for
 *  declaring `NumeralSystem` twice instead of importing it once. */
function arNormalize(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(option: ComboboxOption, needle: string): boolean {
  if (!needle) return true;
  return arNormalize(option.label).includes(needle) || (!!option.hint && arNormalize(option.hint).includes(needle));
}

export function Combobox({
  id,
  name,
  options,
  multiple,
  value,
  defaultValue,
  onChange,
  placeholder,
  allowCreate,
  max,
  invalid,
  resultsLabel,
  className = "",
}: ComboboxProps & { }) {
  const generatedId = useId();
  const field = useFieldWiring();
  // Explicit prop wins, then `<Field>`'s own id, then a generated one —
  // `ui/input.tsx`'s exact precedence for the same reason: a caller passing
  // `id` directly (outside a `<Field>`, or overriding it) means it.
  const comboId = id ?? field?.id ?? generatedId;
  const listboxId = `${comboId}-listbox`;
  const isInvalid = invalid ?? field?.invalid ?? false;
  // `ui.combobox` — landed in `ui.json`; see the header comment's item 4.
  const t = useTranslations("ui");

  const isControlled = value !== undefined;
  const [uncontrolledSelected, setUncontrolledSelected] = useState<string[]>(defaultValue ?? []);
  // `value ?? []` would allocate a fresh array every render once `value` is
  // controlled-but-empty, defeating anything memoised against `selected` —
  // stabilised so it only changes reference when `value` itself does.
  const selected = useMemo(() => (isControlled ? (value ?? []) : uncontrolledSelected), [isControlled, value, uncontrolledSelected]);

  const optionByValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);

  // Single-select shows the chosen option's own label in the text field
  // (member-picker.tsx's exact precedent) until the person types again.
  const [query, setQuery] = useState(() => (!multiple && selected[0] ? (optionByValue.get(selected[0])?.label ?? "") : ""));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A controlled single-select `value` changed from OUTSIDE (not by typing
  // here) — resync the visible text to match. Done DURING RENDER, not in an
  // effect: this is React's own documented pattern for "adjust state when a
  // prop changes" (react.dev/learn/you-might-not-need-an-effect) — calling
  // `setState` here makes React redo this render immediately, before
  // committing, rather than paint-then-effect-then-repaint, and it is also
  // what the `react-hooks/set-state-in-effect` lint rule (new this wave)
  // asks for instead of a `useEffect` that exists only to call `setQuery`.
  const controlledSingleValue = !multiple && isControlled ? (value?.[0] ?? null) : null;
  const [lastSeenControlledValue, setLastSeenControlledValue] = useState(controlledSingleValue);
  if (!multiple && isControlled && controlledSingleValue !== lastSeenControlledValue) {
    setLastSeenControlledValue(controlledSingleValue);
    setQuery(controlledSingleValue ? (optionByValue.get(controlledSingleValue)?.label ?? "") : "");
  }

  function commit(next: string[]) {
    if (!isControlled) setUncontrolledSelected(next);
    onChange?.(next);
  }

  const atMax = multiple && max !== undefined && selected.length >= max;

  const filtered = useMemo(() => {
    const needle = arNormalize(query);
    return options.filter((o) => !(multiple && selected.includes(o.value)) && matches(o, needle));
  }, [options, query, multiple, selected]);

  const normalizedQuery = arNormalize(query);
  const exactMatch = options.some((o) => arNormalize(o.label) === normalizedQuery);
  const canCreate = !!allowCreate && query.trim().length > 0 && !exactMatch && !atMax;

  const rowCount = filtered.length + (canCreate ? 1 : 0);

  // Same "adjust state during render" pattern as above: clamp the highlight
  // the moment the row count itself changes (a keystroke narrowing the
  // filter), not in a follow-up effect.
  const [lastRowCount, setLastRowCount] = useState(rowCount);
  if (rowCount !== lastRowCount) {
    setLastRowCount(rowCount);
    if (highlight > rowCount - 1) setHighlight(rowCount === 0 ? -1 : rowCount - 1);
  }

  // ★ The open list — or its «no match» line — is scrolled into view whenever
  // it opens or its rows change. A picker near the bottom of a phone screen
  // opened its list UNDER the fixed tab bar: the admin typed a name and
  // nothing appeared to happen (the lead's sync-2 capture of the scoring
  // screen's member picker). `nearest` moves nothing when it already shows;
  // the document's `scroll-padding-block-end` (`globals.css`) already counts
  // the tab bar, so the list stops clear of it without a margin of its own.
  // Inside a dialog or sheet it scrolls that container instead.
  useEffect(() => {
    if (!open) return;
    popupRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open, rowCount]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function selectOption(o: ComboboxOption) {
    if (o.disabled) return;
    if (multiple) {
      if (atMax || selected.includes(o.value)) return;
      commit([...selected, o.value]);
      setQuery("");
    } else {
      commit([o.value]);
      setQuery(o.label);
      inputRef.current?.focus();
    }
    setOpen(false);
    setHighlight(-1);
  }

  function createFromQuery() {
    const created = query.trim();
    if (!created || atMax) return;
    if (multiple) {
      if (!selected.includes(created)) commit([...selected, created]);
      setQuery("");
    } else {
      commit([created]);
      setQuery(created);
    }
    setOpen(false);
    setHighlight(-1);
  }

  function removeChip(v: string) {
    commit(selected.filter((s) => s !== v));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(rowCount > 0 ? 0 : -1);
      } else {
        setHighlight((h) => Math.min(h + 1, rowCount - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      setOpen(true);
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (highlight >= 0 && highlight < filtered.length) selectOption(filtered[highlight]);
      else if (highlight === filtered.length && canCreate) createFromQuery();
      else if (canCreate) createFromQuery();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
      }
    } else if (e.key === "Backspace" && query === "" && multiple && selected.length > 0) {
      removeChip(selected[selected.length - 1]);
    }
  }

  const resultsText = useMemo(() => {
    if (!open) return "";
    if (resultsLabel) return resultsLabel(filtered.length);
    return t("combobox.resultsCount", { count: filtered.length, value: formatNumber(filtered.length) });
  }, [open, filtered.length, resultsLabel, t]);

  const activeDescendant =
    open && highlight >= 0
      ? highlight < filtered.length
        ? `${listboxId}-option-${highlight}`
        : `${listboxId}-create`
      : undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {multiple && selected.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((v) => {
            const opt = optionByValue.get(v);
            const label = opt?.label ?? v;
            return (
              <li key={v}>
                <span className="inline-flex items-center gap-1 rounded-field border border-edge-strong bg-silver-100 py-1 ps-2.5 pe-1 text-body-sm text-fg-heading">
                  <bdi>{label}</bdi>
                  <button
                    type="button"
                    onClick={() => removeChip(v)}
                    // `aria-label` is a plain string, so `t.markup()` —
                    // never `t.rich()`, which would return a `<bdi>`
                    // element — with a pass-through `<t>` tag, matching
                    // `page-viewer.tsx`'s own precedent for the same
                    // constraint. The catalogue-wide bidi test
                    // (`proposal-copy.test.tsx`) still requires the `<t>`
                    // tag in the SOURCE string; an attribute has no visual
                    // direction to isolate, so the tag here is a no-op.
                    aria-label={t.markup("combobox.removeChip", { name: label, t: (chunks) => chunks })}
                    className="inline-flex size-6 items-center justify-center rounded-field text-fg-muted hover:bg-silver-200 hover:text-fg-heading"
                  >
                    <CloseIcon className="text-sm" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        id={comboId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        aria-invalid={isInvalid || undefined}
        aria-required={field?.required || undefined}
        aria-describedby={describedIds(field?.describedBy)}
        autoComplete="off"
        disabled={atMax && multiple}
        placeholder={atMax ? undefined : placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!multiple) commit([]);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={controlClass(isInvalid)}
      />

      {/* The one place `resultsText` renders when there are zero rows: both
          the visible message AND its own announcement (`role="status"` is
          an implicit `aria-live="polite"` region) — not `aria-hidden` plus a
          SEPARATE sr-only live region repeating the same string, which
          duplicated the text in the accessibility tree and in this
          component's own test (`aria-live` region below covers the
          NON-zero case only, so the two never coexist). */}
      {open && rowCount === 0 ? (
        <div ref={(node) => { popupRef.current = node; }} role="status" className="absolute z-20 mt-1 w-full rounded-field border border-edge-strong bg-canvas px-3 py-2 text-body-sm text-fg-muted shadow-lg">
          {resultsText}
        </div>
      ) : null}

      {open && rowCount > 0 ? (
        <ul ref={(node) => { popupRef.current = node; }} id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-field border border-edge-strong bg-canvas shadow-lg">
          {/* `role="option"` lives ON THE BUTTON, not on the `<li>` wrapper —
              member-picker.tsx's own precedent, and the ARIA-correct place
              for it: a listbox option must not contain a nested interactive
              descendant, and `getByRole("option")` (this component's own
              test) resolving to an element a click never reaches was how
              this was actually found. `role="presentation"` on the `<li>`
              strips its own implicit `listitem` role, so `listbox`'s
              required-children relationship with `option` is unbroken —
              without it, axe's `aria-required-children`/`aria-required-parent`
              both fail, found by this component's own axe assertion. */}
          {filtered.map((o, i) => (
            <li key={o.value} role="presentation">
              <button
                type="button"
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={i === highlight}
                disabled={o.disabled}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => selectOption(o)}
                className={`block w-full px-3 py-2 text-start text-body-sm ${i === highlight ? "bg-silver-100" : ""} ${o.disabled ? "text-fg-muted/50" : "text-fg-heading"}`}
              >
                <bdi>{o.label}</bdi>
                {o.hint ? (
                  <span className="ms-2 text-fg-muted">
                    <bdi>{o.hint}</bdi>
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {canCreate ? (
            <li role="presentation">
              <button
                type="button"
                id={`${listboxId}-create`}
                role="option"
                aria-selected={highlight === filtered.length}
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={createFromQuery}
                className={`block w-full px-3 py-2 text-start text-body-sm text-fg-heading ${highlight === filtered.length ? "bg-silver-100" : ""}`}
              >
                {t.rich("combobox.createOption", { name: query.trim(), t: (chunks) => <bdi>{chunks}</bdi> })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* Only the non-zero case: `role="status"` above already announces
          and displays the zero-results text once, on its own. */}
      {rowCount > 0 ? (
        <div aria-live="polite" className="sr-only">
          {resultsText}
        </div>
      ) : null}

      {multiple
        ? selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)
        : <input type="hidden" name={name} value={selected[0] ?? ""} />}
    </div>
  );
}
