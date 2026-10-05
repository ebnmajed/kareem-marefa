"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateDocument, type DesignDocument } from "@kareem/designer-runtime";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-057's local draft — REQ-DSG-036, STORY-DSG-020, DEC-258 §2.3, DEC-259 §2.
//
// ★ A LOCAL DRAFT IS NOT AUTOSAVE. Autosave wrote to the SERVER, which is what exports, previews, publishing and
// other admins read. This writes to the browser's own storage, and nothing but this editor reads it: no request, no
// `updated_at`. The document still changes at exactly one moment, and it is the one the person chooses — a restored
// draft is on screen, unsaved, until they press «احفظ».
//
// `localStorage`, not IndexedDB: the two writes that matter most — `pagehide` and the editor's unmount, which is how
// the browser's Back leaves — must finish synchronously. Not `sessionStorage`: it dies with the tab, and a closed tab
// is the case this exists for. ★ EVERY ACCESS IS CAUGHT, the getter included (a blocked origin throws on
// `window.localStorage` itself): the draft is a best effort and the editor works the same without it (DEC-259 §2.4).
//
// Keyed by MEMBER and document, so a second admin on the same browser never sees, overwrites or deletes the first's.
// Not swept at sign-out (DEC-259 §2.2).

export interface DesignerDraft {
  v: 1;
  documentId: string;
  memberId: string;
  /** The `updated_at` the edits sit on — the base the save would carry. */
  baseUpdatedAt: string;
  writtenAt: string;
  document: DesignDocument;
}

export const draftKey = (memberId: string, documentId: string) => `kareem.designer.draft.v1:${memberId}:${documentId}`;

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The draft, or null. One that cannot be parsed or validated is removed: it cannot be offered, so removing it is not
 *  «dropped silently» (DEC-259 §2.5). */
export function readDraft(memberId: string, documentId: string): DesignerDraft | null {
  const key = draftKey(memberId, documentId);
  let raw: string | null;
  try {
    raw = store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<DesignerDraft>;
    if (
      value.v === 1 &&
      value.documentId === documentId &&
      value.memberId === memberId &&
      typeof value.baseUpdatedAt === "string" &&
      typeof value.writtenAt === "string" &&
      validateDocument(value.document).ok
    ) {
      return value as DesignerDraft;
    }
  } catch {
    // fall through: unreadable
  }
  removeDraft(memberId, documentId);
  return null;
}

/** True when the write landed. A full, blocked or absent storage answers false and says nothing (DEC-259 §2.4). */
export function writeDraft(draft: Omit<DesignerDraft, "v" | "writtenAt">): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(draftKey(draft.memberId, draft.documentId), JSON.stringify({ v: 1, writtenAt: new Date().toISOString(), ...draft }));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(memberId: string, documentId: string): void {
  try {
    store()?.removeItem(draftKey(memberId, documentId));
  } catch {
    // nothing to do
  }
}

/** ★ Stale: the server's document moved after the edits were made. Compared as instants — the page and the route may
 *  spell one timestamp two ways. */
export function isStale(draft: Pick<DesignerDraft, "baseUpdatedAt">, serverUpdatedAt: string): boolean {
  return new Date(draft.baseUpdatedAt).getTime() !== new Date(serverUpdatedAt).getTime();
}

type Idle = { cancel: () => void };
function whenIdle(run: () => void): Idle {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 1000 });
    return { cancel: () => w.cancelIdleCallback!(id) };
  }
  // Safari has no requestIdleCallback: the next task, which still coalesces a held key's repeats into one write.
  const id = window.setTimeout(run, 0);
  return { cancel: () => window.clearTimeout(id) };
}

export interface DraftOffer {
  draft: DesignerDraft;
  stale: boolean;
}

/**
 * The offer — read once, after hydration, before the editor's state is built, so the editor is read-only from the
 * render that shows it (DEC-259 §2.6). ★ `pending` is the OFFER, not the read: the server's HTML and the hydration
 * pass are the editable editor, so nothing flashes on a load with no draft; nothing can be edited before the read
 * anyway — it happens as the page hydrates.
 */
export function useDraftOffer({ owner, documentId, enabled, serverUpdatedAt }: { owner: string | null; documentId: string; enabled: boolean; serverUpdatedAt: string }) {
  const active = Boolean(owner) && enabled;
  const hydrated = useHydrated();
  const [answered, setAnswered] = useState(false);
  // Read once, after hydration (the server's HTML has no storage). `readDraft` removes an unreadable entry, which is
  // idempotent, so a second render pass changes nothing.
  const draft = useMemo(() => (hydrated && active ? readDraft(owner as string, documentId) : null), [hydrated, active, owner, documentId]);
  const offer: DraftOffer | null = draft && !answered ? { draft, stale: isStale(draft, serverUpdatedAt) } : null;

  /** «استعِدها» returns the document to put on screen; «احذفها» removes the draft. Either way the editor opens. */
  const answer = useCallback(
    (restore: boolean): DesignDocument | null => {
      setAnswered(true);
      if (!restore && owner) removeDraft(owner, documentId);
      return restore ? (draft?.document ?? null) : null;
    },
    [draft, owner, documentId],
  );

  // `mirror` waits for hydration: on the hydration pass nothing has been read, and a mirror that ran then would remove
  // the draft before it could be offered.
  return { offer, mirror: active && hydrated && offer === null, pending: offer !== null, answer };
}

/**
 * The mirror. While dirty, the document on screen is written at the next idle moment after each change, and
 * synchronously on `pagehide`, on the tab going hidden and at unmount — which is how the browser's Back leaves. While
 * clean it is removed, so a save that landed and an undo back to the saved document both delete it. Off while an
 * offer is unanswered: the old draft is the person's until they answer.
 */
export function useDraftMirror({
  owner,
  documentId,
  active,
  document,
  dirty,
  baseOf,
}: {
  owner: string | null;
  documentId: string;
  active: boolean;
  document: DesignDocument;
  dirty: boolean;
  /** The base the edits on screen sit on, read at write time. */
  baseOf: () => string;
}) {
  /** Set by a confirmed discard: the unmount must not write the draft back. */
  const leaving = useRef(false);

  const writeNow = useCallback(
    (doc: DesignDocument) => {
      if (!owner) return;
      writeDraft({ documentId, memberId: owner, baseUpdatedAt: baseOf(), document: doc });
    },
    [owner, documentId, baseOf],
  );

  useEffect(() => {
    if (!active || !owner || leaving.current) return;
    if (!dirty) {
      removeDraft(owner, documentId);
      return;
    }
    const pending = whenIdle(() => writeNow(document));
    return () => pending.cancel();
  }, [active, dirty, document, owner, documentId, writeNow]);

  const latest = useRef({ write: false, document });
  useEffect(() => {
    latest.current = { write: active && dirty, document };
  }, [active, dirty, document]);
  useEffect(() => {
    if (!owner) return;
    const flushDraft = () => {
      if (latest.current.write && !leaving.current) writeNow(latest.current.document);
    };
    const onVisibility = () => {
      if (window.document.visibilityState === "hidden") flushDraft();
    };
    window.addEventListener("pagehide", flushDraft);
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushDraft);
      window.document.removeEventListener("visibilitychange", onVisibility);
      flushDraft();
    };
  }, [owner, writeNow]);

  /** A confirmed discard: the draft goes, and nothing writes it back on the way out. */
  const discard = useCallback(() => {
    leaving.current = true;
    if (owner) removeDraft(owner, documentId);
  }, [owner, documentId]);

  return { discard };
}
