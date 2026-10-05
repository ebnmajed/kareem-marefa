// SCR-057's state machine, moved out of `editor.tsx` — wave 23, slice 1 (DEC-237 §2).
//
// The editor's behaviour had no component test: four e2e specs pinned it. This
// pins the machine itself, so the chrome can be rebuilt over it and the same
// cases run before and after: fifty document-level steps (06 §10), a gesture or
// a burst of arrow presses is ONE entry (W13.1 R5), a no-op is not an entry, a
// new edit ends the redo branch, the person's save is one PUT carrying
// `baseUpdatedAt` (wave 28, REQ-DSG-036 — an edit sends nothing, however long
// it waits), every refusal maps to its state, dirty is DERIVED from the saved
// document, and a locked layer is refused a move, a hide or a delete but not
// its focal point (REQ-DSG-024).
import type React from "react";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";
import { UNDO_STEPS, useDesignerEditorState } from "@/components/designer/editor-state";
import type { DesignerEditorProps } from "@/components/designer/editor";
import arDesigner from "@/messages/ar/designer.json";
import arUi from "@/messages/ar/ui.json";

const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const shape = (id: string, extra: Partial<Layer> = {}): Layer =>
  ({ id, name: id, kind: "shape", frame: { x: 200, y: 300, w: 200, h: 100 }, shape: { type: "rect", fill: "{{brand.surface}}" }, ...extra }) as Layer;

const image = (id: string, extra: Partial<Layer> = {}): Layer =>
  ({ id, name: id, kind: "image", frame: { x: 200, y: 600, w: 300, h: 300 }, image: { assetId: "00000000-0000-4000-8000-000000000001", fit: "cover" }, ...extra }) as Layer;

const poster = (layers: Layer[]): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  layers,
});

function props(document: DesignDocument, extra: Partial<DesignerEditorProps> = {}): DesignerEditorProps {
  return {
    documentId: "doc-1",
    purpose: "poster",
    initialDocument: document,
    initialUpdatedAt: "2026-10-03T10:00:00.000Z",
    bindings: {},
    declaredBindings: [],
    faces: [],
    lockedLayerIds: [],
    canEdit: true,
    origin: "http://localhost:3000",
    assetSizes: {},
    variantPreviews: {},
    ...extra,
  };
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arDesigner, ...arUi }}>
    {children}
  </NextIntlClientProvider>
);

function mount(document: DesignDocument, extra: Partial<DesignerEditorProps> = {}, editable = true) {
  const onRevealLayer = vi.fn();
  const hook = renderHook(() => useDesignerEditorState(props(document, extra), { onRevealLayer, editable }), { wrapper: Wrap });
  return { ...hook, onRevealLayer };
}

type Reply = { status: number; body: Record<string, unknown> };
let replies: Reply[] = [];
const fetchMock = vi.fn(async (...call: [url: string, init?: RequestInit]) => {
  void call;
  const reply = replies.shift() ?? { status: 200, body: { status: "saved", updatedAt: "2026-10-03T10:00:05.000Z" } };
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body } as Response;
});

beforeEach(() => {
  vi.useFakeTimers();
  replies = [];
  fetchMock.mockClear();
  show.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The person presses «احفظ» (wave 28): the state's own save, awaited inside `act`. */
async function save(result: { current: ReturnType<typeof useDesignerEditorState> }): Promise<boolean> {
  let landed = false;
  await act(async () => {
    landed = await result.current.saveDocument();
  });
  return landed;
}

/** Long past the old autosave's 1200 ms — a timer that still fired would be seen. */
async function wait() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
}

describe("undo — document-level, fifty steps (06 §10)", () => {
  it("keeps fifty steps and no more", () => {
    const { result } = mount(poster([shape("a")]));
    for (let i = 1; i <= UNDO_STEPS + 5; i++) {
      act(() => result.current.transform("a", { kind: "rotate", degrees: 1, mode: "by" }));
    }
    expect(result.current.depth.past).toBe(UNDO_STEPS);
    expect(result.current.document.layers[0]?.frame.rotation).toBe(UNDO_STEPS + 5);
  });

  it("undo and redo walk the steps; a new edit ends the redo branch", () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    act(() => result.current.step("undo"));
    expect(result.current.document.layers[0]?.frame.rotation).toBe(15);
    expect(result.current.depth).toEqual({ past: 1, future: 1 });
    act(() => result.current.step("redo"));
    expect(result.current.document.layers[0]?.frame.rotation).toBe(30);
    act(() => result.current.step("undo"));
    act(() => result.current.transform("a", { kind: "fillWidth" }));
    expect(result.current.depth.future).toBe(0);
  });

  it("a no-op is not an undo step", () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.arrange("a", { kind: "align", axis: "inline", edge: "start", target: "safe" }));
    expect(result.current.depth.past).toBe(1);
    act(() => result.current.arrange("a", { kind: "align", axis: "inline", edge: "start", target: "safe" }));
    expect(result.current.depth.past).toBe(1);
  });
});

describe("one entry per gesture or burst (W13.1 R5)", () => {
  it("a burst of arrow presses is one entry, and a key release ends it", () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.select("a"));
    for (let i = 0; i < 5; i++) act(() => result.current.nudge(1, 0));
    expect(result.current.depth.past).toBe(1);
    act(() => result.current.endBurst());
    act(() => result.current.nudge(1, 0));
    expect(result.current.depth.past).toBe(2);
  });

  it("a canvas gesture's frames are one entry", () => {
    const { result } = mount(poster([shape("a"), shape("b")]));
    act(() => result.current.applyFrames({ a: { x: 10, y: 20, w: 200, h: 100 }, b: { x: 30, y: 40, w: 200, h: 100 } }));
    expect(result.current.depth.past).toBe(1);
    expect(result.current.document.layers.map((l) => l.frame.x)).toEqual([10, 30]);
  });
});

describe("the save — the person's, through the Route Handler (REQ-DSG-036)", () => {
  it("an edit sends nothing, however long it waits; Save is one PUT carrying the base it read, and the next carries the base it was answered", async () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    await wait();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await save(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/designer/doc-1");
    expect(init?.method).toBe("PUT");
    const sent = JSON.parse(String(init?.body));
    expect(sent.baseUpdatedAt).toBe("2026-10-03T10:00:00.000Z");
    expect(sent.document.layers[0].frame.rotation).toBe(30);
    expect(result.current.save.kind).toBe("saved");

    act(() => result.current.transform("a", { kind: "rotate", degrees: 0, mode: "to" }));
    await save(result);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).baseUpdatedAt).toBe("2026-10-03T10:00:05.000Z");
  });

  it("undo and redo send nothing", async () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    act(() => result.current.step("undo"));
    act(() => result.current.step("redo"));
    await wait();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 409, body: { status: "locked_region", layerId: "a" } }, "locked", false],
    [{ status: 409, body: { status: "conflict" } }, "conflict", true],
    [{ status: 403, body: {} }, "forbidden", true],
    [{ status: 422, body: { issues: [{ path: "layers.0", code: "bad" }] } }, "invalid", false],
    [{ status: 500, body: {} }, "error", true],
  ] as const)("a %o answer is the state %s, toasted only for the three failures — and the save did not land", async (reply, kind, toasted) => {
    const { result } = mount(poster([shape("a")]));
    replies = [reply];
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    expect(await save(result)).toBe(false);
    expect(result.current.save.kind).toBe(kind);
    expect(show).toHaveBeenCalledTimes(toasted ? 1 : 0);
    expect(result.current.dirty).toBe(true);
  });

  it("a second Save while one is in flight sends nothing", async () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = result.current.saveDocument();
      second = result.current.saveDocument();
      await Promise.all([first, second]);
    });
    expect(await second).toBe(false);
    expect(await first).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a clean document's save sends nothing and says it is saved", async () => {
    const { result } = mount(poster([shape("a")]));
    expect(await save(result)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dirty is derived from the saved document, never flagged (DEC-258 §1.2)", () => {
  it("an edit is dirty; an undo back to the saved document is clean, with no request; a redo is dirty again", async () => {
    const { result } = mount(poster([shape("a")]));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.step("undo"));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.step("redo"));
    expect(result.current.dirty).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a document equal to the saved one in content, built in another key order, is clean", () => {
    const saved = poster([shape("a")]);
    const { result } = mount(saved);
    const reversed = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(reversed) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)])) : value;
    act(() => result.current.restore(reversed(saved) as DesignDocument));
    expect(result.current.document).not.toBe(saved);
    expect(result.current.dirty).toBe(false);
  });

  it("a save that lands makes the document clean, and an undo after it is dirty against the NEW saved document", async () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    await save(result);
    expect(result.current.dirty).toBe(false);
    act(() => result.current.step("undo"));
    expect(result.current.dirty).toBe(true);
  });

  it("an edit made while a save is in flight stays dirty after that save lands", async () => {
    let release: (() => void) | undefined;
    fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { ok: true, status: 200, json: async () => ({ status: "saved", updatedAt: "2026-10-03T10:00:05.000Z" }) } as Response;
    });
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = result.current.saveDocument();
    });
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    await act(async () => {
      release?.();
      await pending;
    });
    expect(result.current.save.kind).toBe("saved");
    expect(result.current.dirty).toBe(true);
    expect((result.current.savedDocument.layers[0] as Layer).frame.rotation).toBe(15);
  });
});

describe("while a draft's offer is unanswered, nothing is edited (DEC-259 §2.6)", () => {
  it("an edit, an undo and a save change nothing and send nothing; the restore is the one change", async () => {
    const { result } = mount(poster([shape("a")]), {}, false);
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    act(() => result.current.add("shape"));
    act(() => result.current.step("undo"));
    expect(result.current.document.layers).toHaveLength(1);
    expect(result.current.document.layers[0]?.frame.rotation ?? 0).toBe(0);
    expect(result.current.dirty).toBe(false);
    expect(await save(result)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => result.current.restore(poster([shape("a", { frame: { x: 1, y: 2, w: 200, h: 100 } })])));
    expect(result.current.document.layers[0]?.frame.x).toBe(1);
    expect(result.current.dirty).toBe(true);
  });

  it("a restore is one undo step: undo returns to the server's document, clean", () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.restore(poster([shape("a", { frame: { x: 1, y: 2, w: 200, h: 100 } })])));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.step("undo"));
    expect(result.current.dirty).toBe(false);
  });
});

describe("locked layers (REQ-DSG-024)", () => {
  it("a layer locked by the template or by its own flag is refused a move, a hide and a delete", () => {
    const { result } = mount(poster([shape("a"), shape("b", { locked: true })]), { lockedLayerIds: ["a"] });
    for (const id of ["a", "b"]) {
      act(() => result.current.transform(id, { kind: "rotate", degrees: 15, mode: "by" }));
      expect(result.current.save).toEqual({ kind: "locked", layerId: id });
      act(() => result.current.toggleHidden(id));
      act(() => result.current.askDelete(id));
      expect(result.current.deleting).toBeNull();
    }
    expect(result.current.depth.past).toBe(0);
  });

  it("but its focal point is not a move — it is set", () => {
    const { result } = mount(poster([image("p", { locked: true })]));
    act(() => result.current.focal("p", { x: 0, y: 1 }));
    expect(result.current.depth.past).toBe(1);
    expect((result.current.document.layers[0] as Extract<Layer, { kind: "image" }>).image.focal).toEqual({ x: 0, y: 1 });
  });
});

describe("the chrome decides where a layer is shown", () => {
  it("adding a layer selects it and asks the chrome to reveal it", () => {
    const { result, onRevealLayer } = mount(poster([]));
    act(() => result.current.add("shape"));
    expect(result.current.document.layers).toHaveLength(1);
    expect(result.current.selectedLayerIds).toEqual([result.current.document.layers[0]!.id]);
    expect(onRevealLayer).toHaveBeenCalledTimes(1);
  });
});
