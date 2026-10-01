"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BookmarkChangeProvider, type BookmarkChange } from "@/components/search/bookmark-button";
import { toggleBookmarkAction } from "@/components/search/actions";
import { useToast } from "@/components/ui/toast";

// SCR-024's list — `Bookmarks.dc.html`, `M10c.md` §4, REQ-UIX-074.
//
// ★ A REMOVAL IS OPTIMISTIC AND CAN BE UNDONE. The rows are the server's (`SessionRow`, browse's row, imported as it
// is); this list only decides which of them are shown. `BookmarkButton` reports through `BookmarkChangeProvider`
// (DEC-218 §4.4): on `pending` the row leaves at once and a toast offers «تراجع»; on `failed` the row comes back —
// the button has already rolled itself back and said so in its own error toast.
//
// ★ THE UNDO KEEPS THE ROW'S NODE. The removal's own action revalidates this page, so by the time «تراجع» is pressed
// the server's list may no longer hold the row. The node is captured when the row leaves and drawn again at its
// place while the re-save is in flight; it remounts its button from the server's `initialBookmarked`, which is
// `true` — right again after the undo.

export interface BookmarkListItem {
  id: string;
  row: ReactNode;
}

type Kept = { index: number; row: ReactNode };

export function BookmarkList({ locale, items, empty }: { locale: string; items: BookmarkListItem[]; empty: ReactNode }) {
  const t = useTranslations("profile.bookmarks");
  const toast = useToast();
  // A removed row's node and place, captured when it leaves — the undo draws it again from here.
  const [removed, setRemoved] = useState<ReadonlyMap<string, Kept>>(new Map());
  const [restoring, setRestoring] = useState<ReadonlyMap<string, Kept>>(new Map());

  const undo = useCallback(
    async (id: string, kept: Kept) => {
      setRemoved((prev) => without(prev, id));
      setRestoring((prev) => new Map(prev).set(id, kept));
      const result = await toggleBookmarkAction(locale, id, true);
      setRestoring((prev) => without(prev, id));
      if (result.error) {
        setRemoved((prev) => new Map(prev).set(id, kept));
        toast.show({ title: t("undoFailed"), tone: "error" });
      }
    },
    [locale, t, toast],
  );

  const onChange = useCallback(
    ({ sessionId, bookmarked, status }: BookmarkChange) => {
      if (bookmarked) return;
      if (status === "pending") {
        const index = items.findIndex((item) => item.id === sessionId);
        if (index === -1) return;
        const kept = { index, row: items[index].row };
        setRemoved((prev) => new Map(prev).set(sessionId, kept));
        toast.show({ title: t("removed"), tone: "info", action: { label: t("undo"), onClick: () => void undo(sessionId, kept) } });
      } else if (status === "failed") {
        setRemoved((prev) => without(prev, sessionId));
      }
    },
    [items, t, toast, undo],
  );

  const rows = items.filter((item) => !removed.has(item.id));
  for (const [id, { index, row }] of restoring) {
    if (!rows.some((item) => item.id === id)) rows.splice(Math.min(index, rows.length), 0, { id, row });
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <BookmarkChangeProvider onChange={onChange}>
      <ol className="flex flex-col gap-3">
        {rows.map((item) => (
          <li key={item.id}>{item.row}</li>
        ))}
      </ol>
    </BookmarkChangeProvider>
  );
}

function without<T>(map: ReadonlyMap<string, T>, id: string): ReadonlyMap<string, T> {
  if (!map.has(id)) return map;
  const next = new Map(map);
  next.delete(id);
  return next;
}
