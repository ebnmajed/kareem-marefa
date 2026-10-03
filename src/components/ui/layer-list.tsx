"use client";

import { useId, useState } from "react";
import type { LayerListProps } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ChevronIcon, EyeIcon } from "@/components/ui/icons";

// A document's layers as rows — REQ-DSG-028, REQ-DSG-024, DEC-093 path 2, DEC-235 §5.1. `designer`'s; it replaces
// `src/components/designer/layer-list.tsx` (wave 23), whose rows it draws without the document: the caller hands it the
// order and the words, so a primitive in `ui/` imports nothing of the designer's runtime.
//
// ★ ▲ ▼ ON EVERY ROW ARE THE PATH (DEC-093): reordering without a drag, named «forward / backward» and described by the
// row's own name (`aria-describedby`), because twelve identical «forward» buttons with no object are not a list anyone
// can use by ear. Disabled at the ends.
//
// ★ DRAG IS THE ENHANCEMENT, offered only beside ▲▼ and only when the caller passes `onReorder`: a grip at the row's
// start, `aria-hidden` and out of the tab order — every function it performs is the two buttons' (SC 2.5.7's essential
// exception is claimed for the affordance, as `canvas.tsx` claims it for its handles).
//
// A locked row is listed and readable, never omitted (REQ-DSG-024 removes the ability to MOVE it, not to know it is
// there), and its hide is refused here as the database refuses it. Rows are 44 px (SC 2.5.8). No motion.

export function LayerList({ label, items, onSelect, multi = false, onMove, onReorder, onToggleHidden, labels, className = "" }: LayerListProps) {
  const base = useId();
  const [dragged, setDragged] = useState<string | null>(null);

  if (items.length === 0) return <p className={`text-body-sm text-fg-muted ${className}`}>{labels.empty}</p>;

  return (
    <ul aria-label={label} data-slot="layer-list" className={`flex flex-col gap-1 ${className}`}>
      {items.map((item, index) => {
        const nameId = `${base}-${item.id}`;
        return (
          <li
            key={item.id}
            onDragOver={onReorder && dragged ? (e) => e.preventDefault() : undefined}
            onDrop={
              onReorder && dragged
                ? (e) => {
                    e.preventDefault();
                    if (dragged !== item.id) onReorder(dragged, index);
                    setDragged(null);
                  }
                : undefined
            }
          >
            <div className={`flex items-center gap-1 rounded-field border px-2 py-1 ${item.selected ? "border-edge-strong bg-raised" : "border-edge"}`}>
              {onReorder ? (
                <span
                  aria-hidden="true"
                  draggable
                  data-layer-grip=""
                  title={labels.handle}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", item.id);
                    setDragged(item.id);
                  }}
                  onDragEnd={() => setDragged(null)}
                  className="flex min-h-11 w-4 cursor-grab items-center justify-center text-fg-muted"
                >
                  ⋮
                </span>
              ) : null}

              <button
                type="button"
                aria-pressed={item.selected}
                onClick={(e) => onSelect(item.id, { additive: e.shiftKey || multi })}
                className="min-h-11 min-w-0 flex-1 px-1 text-start"
              >
                <span id={nameId} className="block text-body-sm text-fg-heading">
                  <bdi>{item.name}</bdi>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-caption text-fg-muted">
                  <span>{item.kindLabel}</span>
                  {item.locked ? <span className="rounded-pill border border-edge px-1.5">{labels.locked}</span> : null}
                  {item.hidden ? <span className="rounded-pill border border-edge px-1.5">{labels.hidden}</span> : null}
                </span>
              </button>

              {onMove ? (
                <>
                  <IconButton size="sm" label={labels.forward} aria-describedby={nameId} disabled={index === 0} onClick={() => onMove(item.id, "forward")}>
                    <ChevronIcon direction="up" />
                  </IconButton>
                  <IconButton size="sm" label={labels.backward} aria-describedby={nameId} disabled={index === items.length - 1} onClick={() => onMove(item.id, "backward")}>
                    <ChevronIcon direction="down" />
                  </IconButton>
                </>
              ) : null}

              {onToggleHidden ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  iconStart={<EyeIcon />}
                  aria-describedby={nameId}
                  disabled={item.locked}
                  onClick={() => onToggleHidden(item.id)}
                >
                  {item.hidden ? labels.show : labels.hide}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
