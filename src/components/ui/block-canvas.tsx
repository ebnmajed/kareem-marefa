"use client";

import { useId } from "react";
import type { BlockCanvasBox, BlockCanvasPlace, BlockCanvasProps, BlockCanvasTarget } from "@/components/ui";
import { ChevronIcon, TrashIcon } from "@/components/ui/icons";

// The email's child of `canvas-stage` — REQ-UIX-112, DEC-237 §3, DEC-093. `notify`'s.
//
// ★ AN OVERLAY ON THE ONE RENDERER, NEVER A SECOND ONE. Its child is the frame the mail renderer drew (`REQ-NTF-010`);
// this primitive lays the selection, the handle bar and the drop slots over it and draws nothing of the mail. It
// computes no geometry either: the caller measures the frame's rows and hands over their boxes, in PHYSICAL px from
// the frame's top-left — document geometry, `DEC-096`'s exemption, written here where it is used. The stage around it
// (the ground, the scroll) is `canvas-stage`'s and is not repeated.
//
// ★ EVERY DRAG HAS A PATH THAT IS NOT A DRAG (DEC-093, SC 2.5.7). Reordering is ▲ ▼ on the handle bar, one step each,
// named by the action and described by the row's own label; a long move is «انقل» — the row is armed and a tap on a
// slot places it, the same model the library uses for a new block. The ⋮⋮ grip is the enhancement: `aria-hidden`, out
// of the tab order, and present only when the caller passes `onRowDragStart`.
//
// The handle bar shows on the selected target, and on hover or keyboard focus of any other — never on hover alone, so
// a touch screen and a keyboard reach it. Targets are ≥ 24 px (SC 2.5.8). No motion (`REQ-UIX-053`).

const at = (box: BlockCanvasBox) => ({ left: box.left, top: box.top, width: box.width, height: box.height });

/** A slot is a 40 px band centred on the boundary it inserts at. */
const SLOT = 40;

export function BlockCanvas({
  label,
  width,
  rows,
  fixed = [],
  selectedId,
  onSelect,
  actions,
  labels,
  slots = null,
  onRowDragStart,
  onDropAt,
  children,
  className = "",
}: BlockCanvasProps) {
  const base = useId();

  function target(item: BlockCanvasTarget, index: number, count: number, kind: "row" | "block", columns = false) {
    const selected = selectedId === item.id;
    const nameId = `${base}-${item.id}`;
    return (
      <div
        key={item.id}
        data-canvas-target={kind}
        // PHYSICAL left/top from the frame's own geometry (DEC-096).
        style={at(item.box)}
        className={`group pointer-events-none absolute ${selected ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}
      >
        {columns ? (
          // ★ A ROW OF COLUMNS IS SELECTED BY ITS OWN TAB. Its blocks are targets laid over it and can cover every
          // point of it — a 1/2 row whose button fills a column left no point of the row to tap, so the row could not
          // be selected, moved or deleted with one pointer (DEC-093). The tab sits just above the row's top edge at its
          // start, outside every block's box, always shown, and is the row's one select control.
          <button
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : item.id)}
            className={`pointer-events-auto absolute bottom-full start-2 z-10 min-h-6 rounded-field border px-2 text-caption font-bold text-fg-heading ${
              selected ? "border-accent bg-raised" : "border-edge bg-raised hover:bg-hover"
            }`}
          >
            <bdi>{item.label}</bdi>
          </button>
        ) : (
          <button
            type="button"
            aria-pressed={selected}
            aria-label={item.label}
            onClick={() => onSelect(selected ? null : item.id)}
            className="pointer-events-auto absolute inset-0 cursor-pointer hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-edge-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        )}
        <span id={nameId} hidden>
          {item.label}
        </span>
        {actions ? (
          <div
            role="group"
            aria-label={item.label}
            data-handle-bar=""
            data-selected={selected ? "" : undefined}
            // ★ OUTSIDE ITS OWN TARGET, ALWAYS. A bar laid over the top of the box it acts on covered the very point a
            // person taps to select it (DEC-093). A row's bar sits just above the row at its end — the row tab takes the
            // start — and a block's just below the block, so neither covers its target nor the row's tab.
            className={`pointer-events-auto absolute end-2 z-20 items-center gap-0.5 rounded-field border border-edge bg-raised px-0.5 ${
              kind === "row" ? "bottom-full" : "top-full"
            } ${selected ? "flex" : "hidden group-hover:flex group-focus-within:flex"}`}
          >
            {kind === "row" ? (
              <span className="px-1 text-caption font-bold text-fg-heading">
                <bdi>{item.label}</bdi>
              </span>
            ) : null}
            {onRowDragStart ? (
              <span
                aria-hidden="true"
                draggable
                data-handle-grip=""
                title={labels.drag}
                onDragStart={(event) => onRowDragStart(item.id, event)}
                className="flex min-h-6 w-5 cursor-grab items-center justify-center text-fg-muted"
              >
                ⋮⋮
              </span>
            ) : null}
            <BarButton label={labels.moveUp} describedBy={nameId} disabled={index === 0} onClick={() => actions.moveUp(item.id)}>
              <ChevronIcon direction="up" />
            </BarButton>
            <BarButton label={labels.moveDown} describedBy={nameId} disabled={index === count - 1} onClick={() => actions.moveDown(item.id)}>
              <ChevronIcon direction="down" />
            </BarButton>
            <button
              type="button"
              aria-describedby={nameId}
              onClick={() => actions.move(item.id)}
              className="min-h-6 rounded-field px-1 text-caption font-bold text-fg-heading hover:bg-hover"
            >
              {labels.move}
            </button>
            <BarButton label={labels.duplicate} describedBy={nameId} onClick={() => actions.duplicate(item.id)}>
              <DuplicateGlyph />
            </BarButton>
            <BarButton label={labels.remove} describedBy={nameId} onClick={() => actions.remove(item.id)}>
              <TrashIcon />
            </BarButton>
          </div>
        ) : null}
      </div>
    );
  }

  function slot(place: BlockCanvasPlace, box: BlockCanvasBox, key: string) {
    if (!slots) return null;
    return (
      <button
        key={key}
        type="button"
        data-canvas-slot=""
        aria-label={slots.describe ? slots.describe(place) : slots.label}
        onClick={() => slots.onPlace(place)}
        onDragOver={onDropAt ? (event) => event.preventDefault() : undefined}
        onDrop={
          onDropAt
            ? (event) => {
                event.preventDefault();
                onDropAt(place, event);
              }
            : undefined
        }
        style={at(box)}
        className="pointer-events-auto absolute z-20 flex items-center justify-center rounded-field border-2 border-dashed border-accent bg-raised text-label font-bold text-fg-heading"
      >
        {slots.label}
      </button>
    );
  }

  // Between rows: one slot at the top of each row and one after the last, centred on the boundary.
  const bandLeft = rows[0]?.box.left ?? 0;
  const bandWidth = rows[0]?.box.width ?? width;
  const boundaries = rows.map((row) => row.box.top);
  const last = rows[rows.length - 1];
  boundaries.push(last ? last.box.top + last.box.height : 0);

  return (
    <div
      data-slot="block-canvas"
      aria-label={label}
      role="region"
      onKeyDown={slots?.onCancel ? (event) => event.key === "Escape" && slots.onCancel?.() : undefined}
      className={`relative ${className}`}
      style={{ width }}
    >
      {children}
      <div className="pointer-events-none absolute inset-0">
        {rows.map((row, index) => target(row, index, rows.length, "row", Boolean(row.cells?.length)))}
        {rows.flatMap((row) =>
          (row.cells ?? []).flatMap((cell) => cell.blocks.map((block, index) => target(block, index, cell.blocks.length, "block"))),
        )}
        {fixed.map((item) => (
          <div key={item.id} aria-hidden="true" data-canvas-fixed="" style={at(item.box)} className="absolute">
            <span className="absolute -top-3 end-2 rounded-field border border-edge bg-raised px-1.5 text-caption text-fg-muted">{labels.fixed}</span>
          </div>
        ))}
        {slots
          ? boundaries.map((y, index) =>
              slot({ index }, { left: bandLeft, top: Math.max(0, y - SLOT / 2), width: bandWidth, height: SLOT }, `between-${index}`),
            )
          : null}
        {slots?.inCells
          ? rows.flatMap((row) =>
              (row.cells ?? []).flatMap((cell, column) => {
                if (cell.blocks.length === 0) return [slot({ rowId: row.id, column, index: 0 }, cell.box, `${row.id}-${column}-0`)];
                const edges = [...cell.blocks.map((block) => block.box.top), cell.box.top + cell.box.height];
                return edges.map((y, index) =>
                  slot({ rowId: row.id, column, index }, { left: cell.box.left, top: Math.max(cell.box.top, y - SLOT / 2), width: cell.box.width, height: SLOT }, `${row.id}-${column}-${index}`),
                );
              }),
            )
          : null}
      </div>
    </div>
  );
}

/** One of the handle bar's controls: a 24 px target (SC 2.5.8's minimum) — the bar must stay small enough to sit
 *  beside a row without reaching the middle of the row it sits on. */
function BarButton({ label, describedBy, disabled, onClick, children }: { label: string; describedBy: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-6 items-center justify-center rounded-field text-fg-heading hover:bg-hover disabled:text-fg-muted disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Two offset squares — «تكرار». Drawn here, `aria-hidden` inside a named button; the house set has no such glyph and
 *  `ui/icons.tsx` is imported by the public routes, so it is not grown for this. */
function DuplicateGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}
