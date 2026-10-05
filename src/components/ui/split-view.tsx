"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { SplitViewProps } from "@/components/ui";
import { Link } from "@/i18n/navigation";

// `sessions'` · a list beside a detail — REQ-UIX-085, REQ-UIX-088, DEC-NEXT-27.
//
// ★ THE KEYBOARD MODEL (`notes/sessions.md` W21.2). The list is a `<ul>` of real links with a ROVING TABINDEX: only
// the focused row is in the Tab order, so Tab leaves the list for the detail. ↑ ↓ move focus by one row, Home End to
// the ends, no wrapping. ARROWS MOVE FOCUS, NOT THE OPEN ITEM — Enter opens, and Enter is the link's own activation,
// so a tap, a click and the no-JS path all do the same thing.
//
// ★ `scroll={false}` IS LOAD-BEARING. Without it Next's layout-router scrolls the changed segment into view and
// focuses it, and the reviewer's place in the list goes with it.
//
// ★ FOCUS IS NEVER LOST. A decided proposal leaves its filter and its row unmounts: if focus was in the list, it moves
// to the row now at that index (or the last). If focus was in the detail — the decision card's buttons unmount once the
// proposal is decided — the detail calls `useSplitView().focusNext()`, which lands on the row after the open one, so
// the next proposal is one Enter away.
//
// `aria-current="page"` marks the OPEN row; the focus ring marks the FOCUSED one. Below `lg` one pane shows (`narrow`);
// from `lg` the list sits at the inline-start, 360 px, sticky under the console's bar. No animation: the open row's
// border changes colour with no transition (`REQ-UIX-053`).

type SplitViewApi = { focusNext: () => void };

const SplitViewContext = createContext<SplitViewApi>({ focusNext: () => {} });

/** For a control inside the detail: after a decision, move focus to the row after the open one. */
export function useSplitView(): SplitViewApi {
  return useContext(SplitViewContext);
}

export function SplitView({ label, items, currentId, toolbar, empty, detail, detailLabelledBy, narrow, back, className = "" }: SplitViewProps) {
  const rows = useRef(new Map<string, HTMLAnchorElement>());
  const listRef = useRef<HTMLUListElement>(null);
  /** Whether focus is (or, for an unmounted row, was last) inside the list. */
  const focusInList = useRef(false);
  const [focusedId, setFocusedId] = useState<string | null>(currentId);
  const handled = useRef(0);
  const [request, setRequest] = useState<{ n: number; id: string | null; index: number } | null>(null);

  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const focusedIndex = focusedId === null ? -1 : ids.indexOf(focusedId);
  const currentIndex = currentId === null ? -1 : ids.indexOf(currentId);
  // The last index each tracked row was seen at, so a row that leaves the list has a place to hand focus to.
  const lastIndex = useRef({ focused: 0, current: 0 });
  useEffect(() => {
    if (focusedIndex >= 0) lastIndex.current.focused = focusedIndex;
    if (currentIndex >= 0) lastIndex.current.current = currentIndex;
  }, [focusedIndex, currentIndex]);

  // The one row in the Tab order: the focused one, else the open one, else the first.
  const tabbableId = focusedIndex >= 0 ? focusedId : currentIndex >= 0 ? currentId : (ids[0] ?? null);

  /** DOM focus only — the row's own `onFocus` records it, so state moves in an event, never in an effect. */
  const focusAt = useCallback(
    (index: number) => {
      if (ids.length === 0) return;
      rows.current.get(ids[Math.max(0, Math.min(index, ids.length - 1))])?.focus();
    },
    [ids],
  );

  // A focused row that left the list: hand focus to the row now at its place, if focus was in the list.
  useEffect(() => {
    if (focusedId === null || ids.includes(focusedId) || !focusInList.current) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) focusAt(lastIndex.current.focused);
  }, [ids, focusedId, focusAt]);

  // `focusNext()` asks; the effect answers after the render that carries the list as it now stands.
  useEffect(() => {
    // Once per ask: a later refresh of the list must not pull focus back.
    if (request === null || handled.current === request.n) return;
    handled.current = request.n;
    // By id first — the list may have refreshed between the ask and this render — else by place.
    const byId = request.id === null ? -1 : ids.indexOf(request.id);
    focusAt(byId >= 0 ? byId : request.index);
  }, [request, ids, focusAt]);

  const api = useMemo<SplitViewApi>(
    () => ({
      focusNext: () => {
        const at = currentId !== null ? ids.indexOf(currentId) : -1;
        // Still listed: the row after it. Gone from the filter: the row that took its place.
        const index = at >= 0 ? at + 1 : lastIndex.current.current;
        setRequest((prev) => ({ n: (prev?.n ?? 0) + 1, id: ids[index] ?? null, index }));
      },
    }),
    [currentId, ids],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const from = focusedIndex >= 0 ? focusedIndex : currentIndex >= 0 ? currentIndex : 0;
    let to: number | null = null;
    if (event.key === "ArrowDown") to = Math.min(from + 1, ids.length - 1);
    else if (event.key === "ArrowUp") to = Math.max(from - 1, 0);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    if (to === null) return;
    event.preventDefault();
    focusAt(to);
  };

  return (
    <SplitViewContext.Provider value={api}>
      <div data-slot="split-view" className={`lg:grid lg:grid-cols-[22.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 ${className}`}>
        <div className={`min-w-0 lg:sticky lg:top-[calc(var(--console-bar,0px)+1.5rem)] ${narrow === "detail" ? "hidden lg:block" : ""}`}>
          {toolbar}
          {items.length === 0 ? (
            empty
          ) : (
            <ul
              ref={listRef}
              aria-label={label}
              onKeyDown={onKeyDown}
              onFocus={() => {
                focusInList.current = true;
              }}
              onBlur={(event) => {
                // An unmounting row blurs with no `relatedTarget`; that is not focus leaving the list.
                const next = event.relatedTarget as Node | null;
                if (next && !listRef.current?.contains(next)) focusInList.current = false;
              }}
              className="flex flex-col gap-1"
            >
              {items.map((item) => {
                const open = item.id === currentId;
                return (
                  <li key={item.id}>
                    <Link
                      ref={(node: HTMLAnchorElement | null) => {
                        if (node) rows.current.set(item.id, node);
                        else rows.current.delete(item.id);
                      }}
                      href={item.href}
                      scroll={false}
                      tabIndex={item.id === tabbableId ? 0 : -1}
                      aria-current={open ? "page" : undefined}
                      onFocus={() => setFocusedId(item.id)}
                      className={`block min-h-11 rounded-field border p-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] ${
                        open ? "border-accent bg-raised" : "border-transparent hover:bg-hover"
                      }`}
                    >
                      {item.children}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* ★ Named only while an item is open: with nothing open the detail draws no heading, and a section naming an id
            that is not in the document has no name — a generic element carrying aria-labelledby (axe's
            aria-prohibited-attr, the wave-26 sweep on an empty queue at 1280). */}
        <section
          aria-labelledby={currentId !== null ? detailLabelledBy : undefined}
          className={`min-w-0 ${narrow === "list" ? "hidden lg:block" : ""}`}
        >
          {back ? (
            <Link href={back.href} className="mb-3 inline-flex min-h-11 items-center text-label text-fg-heading underline underline-offset-4 lg:hidden">
              {back.label}
            </Link>
          ) : null}
          {detail}
        </section>
      </div>
    </SplitViewContext.Provider>
  );
}
