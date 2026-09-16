"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataTableColumn, DataTableProps } from "@/components/ui";

// `console`'s file — the phone treatment is the REQUIREMENT, not a nicety
// (`16` §6.7): below `md` this is a stacked card list, never a horizontally
// scrolling table, "the single worst pattern in the current console" per
// that same section.
//
// `DataTableProps` carries no `search`/pagination field, despite `16` §6.7's
// prose mentioning both — per DEC-102 ("§16.2 is authoritative" over §4.2's
// looser prose for the same kind of mismatch), the FROZEN TYPE wins: search
// and pagination are the calling screen's composition (filter `rows` before
// handing them here, render its own pager), never this primitive's job.
// Documented at length in `docs/plan/notes/console.md`.

function IndeterminateCheckbox({
  id,
  checked,
  indeterminate,
  onChange,
  labelledBy,
}: {
  id?: string;
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  labelledBy: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-labelledby={labelledBy}
      className="size-4 rounded-field border-edge-strong"
    />
  );
}

export function DataTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  rowHref,
  sort,
  onSortChange,
  selection,
  empty,
  pending,
  className = "",
}: DataTableProps<Row>) {
  const tableId = useId();
  const t = useTranslations("admin.dataTable");
  const selectAllLabelId = `${tableId}-select-all-label`;
  const selectRowLabelId = `${tableId}-select-row-label`;

  const selectedSet = useMemo(() => new Set(selection?.selected ?? []), [selection?.selected]);
  const visibleKeys = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const allSelected = selection !== undefined && visibleKeys.length > 0 && visibleKeys.every((k) => selectedSet.has(k));
  const someSelected = selection !== undefined && !allSelected && visibleKeys.some((k) => selectedSet.has(k));

  function toggleAll() {
    if (!selection) return;
    if (allSelected) selection.onChange(selection.selected.filter((k) => !visibleKeys.includes(k)));
    else selection.onChange(Array.from(new Set([...selection.selected, ...visibleKeys])));
  }

  function toggleRow(key: string) {
    if (!selection) return;
    if (selectedSet.has(key)) selection.onChange(selection.selected.filter((k) => k !== key));
    else selection.onChange([...selection.selected, key]);
  }

  function toggleSort(col: DataTableColumn<Row>) {
    if (!col.sortable || !onSortChange) return;
    const direction: "asc" | "desc" = sort && sort.key === col.key && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ key: col.key, direction });
  }

  function ariaSort(col: DataTableColumn<Row>): "ascending" | "descending" | "none" | undefined {
    if (!col.sortable) return undefined;
    if (!sort || sort.key !== col.key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  const sortAnnouncement = useMemo(() => {
    if (!sort) return "";
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return "";
    return `${col.header}: ${sort.direction === "asc" ? t("sortAscending") : t("sortDescending")}`;
  }, [sort, columns, t]);

  const cardColumns = columns.filter((c) => c.onCard);
  // The card's title is always `columns[0]`, `onCard` or not — a card with
  // no heading at all is a worse reading than one extra field the caller
  // didn't opt in. It is never repeated below itself among `cardColumns`.
  const primaryColumn = columns[0];

  if (!pending && rows.length === 0) {
    return (
      <div className={className}>
        <EmptyState {...empty} />
      </div>
    );
  }

  return (
    <div className={className} aria-busy={pending || undefined}>
      <div aria-live="polite" className="sr-only">
        {sortAnnouncement}
      </div>

      {selection && selection.selected.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-field border border-edge-strong bg-silver-100 px-4 py-2.5">
          <p className="text-label text-fg-heading">{selection.label(selection.selected.length)}</p>
          <div className="flex flex-wrap items-center gap-2">{selection.actions}</div>
        </div>
      ) : null}

      {pending ? (
        <div className="space-y-2">
          <Skeleton variant="row" count={5} />
        </div>
      ) : (
        <>
          {/* Desktop / wide: a real table. A too-wide table may still scroll
              horizontally in its OWN container here — the banned pattern is
              a scrolling table on the PHONE, which is the card list below. */}
          <div className="hidden overflow-x-auto md:block">
            <table aria-label={label} className="w-full border-collapse text-body-sm">
              {/* `position: sticky` on each `<th>`, not on the `<tr>` — sticky
                  positioning on a table ROW is unreliable across browsers;
                  every cell gets it individually, which is the portable
                  form. */}
              <thead>
                <tr>
                  {selection ? (
                    <th scope="col" className="sticky top-[var(--header-h)] z-10 w-10 border-b border-edge bg-canvas px-3 py-2.5">
                      <span id={selectAllLabelId} className="sr-only">
                        {t("selectAll")}
                      </span>
                      <IndeterminateCheckbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleAll}
                        labelledBy={selectAllLabelId}
                      />
                    </th>
                  ) : null}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={ariaSort(col)}
                      className={`sticky top-[var(--header-h)] z-10 border-b border-edge bg-canvas px-3 py-2.5 font-medium text-fg-muted ${col.align === "end" ? "text-end" : "text-start"}`}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className="inline-flex items-center gap-1 hover:text-fg-heading"
                        >
                          {col.header}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = rowKey(row);
                  const primaryCellId = `${tableId}-${key}-primary`;
                  return (
                    <tr key={key} className="border-b border-edge last:border-b-0 hover:bg-silver-100/60">
                      {/* `scroll-mt-*` (`scroll-margin-top`) on every cell, not
                          the `<tr>`: the property is not inherited, and a
                          real build's own run found a keyboard user tabbing
                          to a row's own trigger — the browser's default
                          focus-scroll landed it right under the sticky
                          `<thead>` (`top-[var(--header-h)]`), which then
                          intercepted the click (SC 2.4.11). The offset is
                          the shell's own fixed header PLUS the thead row's
                          own rendered height (its `py-2.5` padding plus one
                          `text-body-sm` line, ~44px) — `html`'s own
                          `scroll-padding-block-start` (`globals.css`)
                          already covers `--header-h` for page-level anchors,
                          but a `<thead>` sticky WITHIN the page is invisible
                          to that global rule, so this cell needs the whole
                          offset itself. */}
                      {selection ? (
                        <td className="scroll-mt-[calc(var(--header-h)+2.75rem)] px-3 py-2.5">
                          <IndeterminateCheckbox
                            checked={selectedSet.has(key)}
                            indeterminate={false}
                            onChange={() => toggleRow(key)}
                            labelledBy={`${selectRowLabelId} ${primaryCellId}`}
                          />
                        </td>
                      ) : null}
                      {columns.map((col, i) => (
                        <td
                          key={col.key}
                          id={i === 0 ? primaryCellId : undefined}
                          className={`scroll-mt-[calc(var(--header-h)+2.75rem)] px-3 py-2.5 text-fg-body ${col.align === "end" ? "text-end" : "text-start"}`}
                        >
                          {i === 0 && rowHref ? <Link href={rowHref(row)}>{col.cell(row)}</Link> : col.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <span id={selectRowLabelId} className="sr-only">
              {t("selectRow")}
            </span>
          </div>

          {/* Phone: a stacked card list — `16` §6.7. Only columns marked
              `onCard` appear; the rest are dropped, per the type's own
              comment. */}
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => {
              const key = rowKey(row);
              const primaryCellId = `${tableId}-${key}-primary-card`;
              return (
                <li key={key} className="rounded-card border border-edge p-4">
                  <div className="flex items-start gap-3">
                    {selection ? (
                      <IndeterminateCheckbox
                        checked={selectedSet.has(key)}
                        indeterminate={false}
                        onChange={() => toggleRow(key)}
                        labelledBy={`${selectRowLabelId} ${primaryCellId}`}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div id={primaryCellId} className="text-label text-fg-heading">
                        {rowHref && primaryColumn ? (
                          <Link href={rowHref(row)} className="hover:underline">
                            {primaryColumn.cell(row)}
                          </Link>
                        ) : (
                          primaryColumn?.cell(row)
                        )}
                      </div>
                      {cardColumns
                        .filter((c) => c.key !== primaryColumn?.key)
                        .map((col) => (
                          <div key={col.key} className="flex justify-between gap-3 text-body-sm text-fg-muted">
                            <span>{col.header}</span>
                            <span className="text-fg-body">{col.cell(row)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
