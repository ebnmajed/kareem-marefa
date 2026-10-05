// SCR-057's local draft — wave 28, REQ-DSG-036, STORY-DSG-020, DEC-258 §2.3, DEC-259 §2.
//
// A local draft is not autosave: it is written to the browser's own storage and nothing but the editor reads it. These
// pin the four rules — a stale draft is classified, never applied or dropped silently; a save (a clean document) and a
// confirmed discard delete it; storage that throws never reaches the caller — plus the key per member and document.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";
import { draftKey, isStale, readDraft, removeDraft, useDraftMirror, useDraftOffer, writeDraft } from "@/components/designer/draft";

const doc = (x = 200): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  layers: [{ id: "a", name: "a", kind: "shape", frame: { x, y: 300, w: 200, h: 100 }, shape: { type: "rect", fill: "{{brand.surface}}" } } as Layer],
});

const A = "member-a";
const B = "member-b";
const D = "doc-1";
const BASE = "2026-10-03T10:00:00.000Z";

/** An in-memory `Storage`: the test process's own `localStorage` (Node's, under jsdom) is not a usable one, and a
 *  fresh store per case keeps the cases apart. */
class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

let memory: MemoryStorage;
let getter: () => Storage;
beforeEach(() => {
  memory = new MemoryStorage();
  getter = () => memory;
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => getter() });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the store — keyed by member and document", () => {
  it("writes, reads and removes one member's draft of one document", () => {
    expect(writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc(1) })).toBe(true);
    const draft = readDraft(A, D);
    expect(draft?.document.layers[0]?.frame.x).toBe(1);
    expect(draft?.baseUpdatedAt).toBe(BASE);
    removeDraft(A, D);
    expect(readDraft(A, D)).toBeNull();
  });

  it("a second admin on the same browser reads nothing of the first's", () => {
    writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc(1) });
    expect(readDraft(B, D)).toBeNull();
    removeDraft(B, D);
    expect(readDraft(A, D)).not.toBeNull();
  });

  it("a draft that cannot be parsed or validated is removed on read (it cannot be offered — DEC-259 §2.5)", () => {
    memory.setItem(draftKey(A, D), "{not json");
    expect(readDraft(A, D)).toBeNull();
    expect(memory.getItem(draftKey(A, D))).toBeNull();
    memory.setItem(draftKey(A, D), JSON.stringify({ v: 1, documentId: D, memberId: A, baseUpdatedAt: BASE, writtenAt: BASE, document: { layers: "no" } }));
    expect(readDraft(A, D)).toBeNull();
    expect(memory.getItem(draftKey(A, D))).toBeNull();
  });

  it("stale means the server's document moved after the edits — compared as instants, not strings", () => {
    expect(isStale({ baseUpdatedAt: BASE }, "2026-10-03T10:00:00+00:00")).toBe(false);
    expect(isStale({ baseUpdatedAt: BASE }, "2026-10-03T10:00:05.000Z")).toBe(true);
  });
});

describe("★ storage that throws never breaks editing (DEC-258 §2.3)", () => {
  it("a full storage: the write answers false and throws nothing", () => {
    vi.spyOn(memory, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc() })).toBe(false);
  });

  it("a blocked storage: read and remove throw nothing", () => {
    vi.spyOn(memory, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(memory, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readDraft(A, D)).toBeNull();
    expect(() => removeDraft(A, D)).not.toThrow();
  });

  it("an origin whose `localStorage` getter itself throws: every call is still safe", () => {
    getter = () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc() })).toBe(false);
    expect(readDraft(A, D)).toBeNull();
    expect(() => removeDraft(A, D)).not.toThrow();
  });

  it("the hooks mount, offer nothing and mirror nothing when storage throws", () => {
    getter = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const offer = renderHook(() => useDraftOffer({ owner: A, documentId: D, enabled: true, serverUpdatedAt: BASE }));
    expect(offer.result.current.offer).toBeNull();
    expect(offer.result.current.pending).toBe(false);
    const mirror = renderHook(() => useDraftMirror({ owner: A, documentId: D, active: true, document: doc(5), dirty: true, baseOf: () => BASE }));
    expect(() => mirror.unmount()).not.toThrow();
  });
});

describe("the offer", () => {
  it("a fresh draft is offered, and the editor waits for the answer", () => {
    writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc(7) });
    const { result } = renderHook(() => useDraftOffer({ owner: A, documentId: D, enabled: true, serverUpdatedAt: BASE }));
    expect(result.current.offer?.stale).toBe(false);
    expect(result.current.pending).toBe(true);
    let restored: DesignDocument | null = null;
    act(() => {
      restored = result.current.answer(true);
    });
    expect((restored as DesignDocument | null)?.layers[0]?.frame.x).toBe(7);
    expect(result.current.pending).toBe(false);
    expect(result.current.mirror).toBe(true);
  });

  it("★ a stale draft is offered as stale — never applied, never removed, until answered", () => {
    writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc(7) });
    const { result } = renderHook(() => useDraftOffer({ owner: A, documentId: D, enabled: true, serverUpdatedAt: "2026-10-03T11:00:00.000Z" }));
    expect(result.current.offer?.stale).toBe(true);
    expect(readDraft(A, D)).not.toBeNull();
    act(() => void result.current.answer(false));
    expect(readDraft(A, D)).toBeNull();
  });

  it("a read-only editor neither offers nor touches a draft", () => {
    writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc(7) });
    const { result } = renderHook(() => useDraftOffer({ owner: A, documentId: D, enabled: false, serverUpdatedAt: BASE }));
    expect(result.current.offer).toBeNull();
    expect(result.current.mirror).toBe(false);
    expect(readDraft(A, D)).not.toBeNull();
  });
});

describe("the mirror — local only, never the server", () => {
  it("while dirty it writes at the next idle moment; when clean (a save, an undo to saved) it removes; it sends no request", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const props = { owner: A, documentId: D, active: true, document: doc(9), dirty: true, baseOf: () => BASE };
    const { rerender } = renderHook((p: typeof props) => useDraftMirror(p), { initialProps: props });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(readDraft(A, D)?.document.layers[0]?.frame.x).toBe(9);
    rerender({ ...props, dirty: false });
    expect(readDraft(A, D)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes synchronously at unmount — how the browser's Back leaves", () => {
    const { unmount } = renderHook(() => useDraftMirror({ owner: A, documentId: D, active: true, document: doc(11), dirty: true, baseOf: () => BASE }));
    unmount();
    expect(readDraft(A, D)?.document.layers[0]?.frame.x).toBe(11);
  });

  it("writes synchronously on pagehide", () => {
    renderHook(() => useDraftMirror({ owner: A, documentId: D, active: true, document: doc(12), dirty: true, baseOf: () => BASE }));
    window.dispatchEvent(new Event("pagehide"));
    expect(readDraft(A, D)?.document.layers[0]?.frame.x).toBe(12);
  });

  it("a confirmed discard removes the draft and the unmount does not write it back", () => {
    const { result, unmount } = renderHook(() => useDraftMirror({ owner: A, documentId: D, active: true, document: doc(13), dirty: true, baseOf: () => BASE }));
    window.dispatchEvent(new Event("pagehide"));
    act(() => result.current.discard());
    unmount();
    expect(readDraft(A, D)).toBeNull();
  });

  it("while an offer is unanswered (inactive) it neither writes nor removes", () => {
    writeDraft({ documentId: D, memberId: A, baseUpdatedAt: BASE, document: doc(1) });
    const { unmount } = renderHook(() => useDraftMirror({ owner: A, documentId: D, active: false, document: doc(2), dirty: false, baseOf: () => BASE }));
    unmount();
    expect(readDraft(A, D)?.document.layers[0]?.frame.x).toBe(1);
  });
});
