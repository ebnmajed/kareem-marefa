"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import type { EditorRailProps } from "@/components/ui";
import { StudioGlyph } from "@/components/studio/glyphs";

// The studio's one sidebar — REQ-UIX-107, DEC-235 §4 (`DEC-NEXT-36`), DEC-237. The lead's; both editors compose it.
//
// From `AdminDesigner.dc.html` and `AdminEmails.dc.html`: a 68 px rail of icon-over-label items at the inline-start
// and, beside it, a 300 px panel that SWAPS with the rail's selection. There is no right panel.
//
// ★ A VERTICAL TABLIST AND ONE TABPANEL. The artboards draw the items as `#hash` links; what they do is select which
// panel is shown, which is a tab. ↑/↓ move between tabs (the rail is vertical, so the axis is the block one and RTL
// does not flip it), Home/End jump, and a single tap selects — nothing here drags, so SC 2.5.7 is not engaged.
//
// ★ FOCUS STAYS WHERE THE PERSON PUT IT. Selecting a tab does not move focus into the panel; an editor that changes the
// selection from the canvas (a layer selected → الطبقة) does not steal focus either — `selected` is controlled.
//
// A count is drawn only above 0, with its accessible text (الفحوصات's findings). No motion — no transition on the
// swap, no hover scale (`REQ-UIX-053`). The panel scrolls on its own and never clips a text line.

export function EditorRail({ label, items, selected, onSelect, children, panelTabs, panelTitle, panelAction, className = "" }: EditorRailProps) {
  const base = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = items.find((item) => item.key === selected) ?? items[0];
  const tabId = (key: string) => `${base}-tab-${key}`;
  const panelId = `${base}-panel`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = items.length - 1;
    const next =
      event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(items[next].key);
    tabs.current[next]?.focus();
  }

  if (!current) return null;

  return (
    <div data-slot="editor-rail" className={`flex h-full min-h-0 ${className}`}>
      <div role="tablist" aria-label={label} aria-orientation="vertical" className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 border-e border-edge py-2.5">
        {items.map((item, index) => {
          const on = item.key === current.key;
          const counted = item.count !== undefined && item.count.value > 0;
          return (
            <button
              key={item.key}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              id={tabId(item.key)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(item.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`flex w-14 flex-col items-center gap-1 rounded-field py-2 text-caption font-bold ${
                on ? "bg-raised text-fg-heading" : "text-fg-muted hover:bg-hover hover:text-fg-heading"
              }`}
            >
              <StudioGlyph name={item.glyph} />
              <span className="text-center">{item.label}</span>
              {counted ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-signal px-1 text-caption font-bold text-on-signal">
                  <span aria-hidden="true">
                    <bdi>{item.count!.value}</bdi>
                  </span>
                  <span className="sr-only">{item.count!.label}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(current.key)}
        className="flex w-[18.75rem] shrink-0 flex-col border-e border-edge"
      >
        <div className="flex flex-col gap-2.5 px-3.5 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 text-label font-bold text-fg-heading">{panelTitle ?? current.label}</h2>
            {panelAction}
          </div>
          {panelTabs}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5">{children}</div>
      </div>
    </div>
  );
}
