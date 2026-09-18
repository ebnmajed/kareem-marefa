"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/icon-button";
import { ChevronIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import type { ReorderableListProps } from "@/components/ui";

// The lead's file — `16` §10.2.1, REQ-DSG-028, SC 2.5.7, DEC-160 §5.
//
// «Three lists, one primitive»: a survey's questions, a choice question's
// options and an email's blocks. The studio's layer list did this first
// (`components/designer/layer-list.tsx`, DEC-093) but is typed on
// `DesignDocument`; this is that pattern with the document taken out.
//
// ★ TAPS ALONE. ▲ and ▼ are buttons: a press-and-release moves the row one
// place. There is no drag in this file on purpose — a drag layered on later is
// an enhancement, and nobody needs it in order to conform (SC 2.5.7).
//
// ★ NAMED BY THE ROW THEY MOVE. Every ▲ is called «انقل لأعلى» and every ▼
// «انقل لأسفل»; what tells twelve of them apart by ear is `aria-describedby`
// pointing at the row's own name. The name element is `hidden`: a referenced
// element is read for a description whether or not it is rendered, and a
// visible or `sr-only` copy would be read a second time in the row itself.
//
// ★ AT AN END THE BUTTON IS `aria-disabled`, NEVER `disabled`. A row moved to
// the top by keyboard would otherwise blur the very button that moved it — the
// browser drops focus from a control the moment it is disabled — and the next
// Tab would start from the top of the page. Inert, dimmed, still focused.
//
// ★ CONTROLLED. `onReorder` hands back the whole new order; the rows move when
// the caller's `items` do. The announcement is made here and now, because the
// move is what the person did — an autosave that fails says so itself.

export function ReorderableList<Item>({
  items,
  getKey,
  getName,
  renderItem,
  renderActions,
  onReorder,
  label,
  disabled = false,
  size = "md",
  className = "",
}: ReorderableListProps<Item>) {
  const t = useTranslations("ui.reorderableList");
  const base = useId();
  const [announcement, setAnnouncement] = useState<{ name: string; position: number; total: number } | null>(null);

  const total = items.length;
  const keys = items.map(getKey);

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (disabled || to < 0 || to >= total) return;
    const next = [...keys];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    setAnnouncement({ name: getName(items[index]), position: to + 1, total });
    onReorder(next, { key: moved, from: index, to });
  }

  const inert = "aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

  return (
    <div className={className}>
      <ol aria-label={label} className="flex flex-col gap-2">
        {items.map((item, index) => {
          const key = keys[index];
          const nameId = `${base}-${key}-name`;
          const context = { index, total };
          const atTop = disabled || index === 0;
          const atBottom = disabled || index === total - 1;
          return (
            <li key={key} className="flex items-start gap-2">
              <span id={nameId} hidden>
                {getName(item)}
              </span>
              <div className="min-w-0 flex-1">{renderItem(item, context)}</div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  size={size}
                  label={t("moveUp")}
                  aria-describedby={nameId}
                  aria-disabled={atTop || undefined}
                  className={inert}
                  onClick={() => move(index, -1)}
                >
                  <ChevronIcon direction="up" />
                </IconButton>
                <IconButton
                  size={size}
                  label={t("moveDown")}
                  aria-describedby={nameId}
                  aria-disabled={atBottom || undefined}
                  className={inert}
                  onClick={() => move(index, 1)}
                >
                  <ChevronIcon direction="down" />
                </IconButton>
                {renderActions ? renderActions(item, context) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* One polite region for the whole list. Its text names the position, so
          two moves in a row are two different sentences and both are read. */}
      <p role="status" className="sr-only">
        {announcement
          ? t.rich("moved", {
              name: announcement.name,
              position: formatNumber(announcement.position),
              total: formatNumber(announcement.total),
              t: (chunks) => <bdi>{chunks}</bdi>,
            })
          : null}
      </p>
    </div>
  );
}
