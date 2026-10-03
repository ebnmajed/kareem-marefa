// SCR-057's state machine, moved out of `editor.tsx` — wave 23, slice 1 (DEC-237 §2).
//
// The editor's behaviour had no component test: four e2e specs pinned it. This
// pins the machine itself, so the chrome can be rebuilt over it and the same
// cases run before and after: fifty document-level steps (06 §10), a gesture or
// a burst of arrow presses is ONE entry (W13.1 R5), a no-op is not an entry, a
// new edit ends the redo branch, the autosave is one PUT after 1200 ms of quiet
// carrying `baseUpdatedAt`, every refusal maps to its state, and a locked layer
// is refused a move, a hide or a delete but not its focal point (REQ-DSG-024).
import type React from "react";
import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";
import { AUTOSAVE_DELAY_MS, UNDO_STEPS, useDesignerEditorState } from "@/components/designer/editor-state";
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

function mount(document: DesignDocument, extra: Partial<DesignerEditorProps> = {}) {
  const onRevealLayer = vi.fn();
  const hook = renderHook(() => useDesignerEditorState(props(document, extra), { onRevealLayer }), { wrapper: Wrap });
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

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10);
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

describe("the autosave — a Route Handler, after 1200 ms of quiet", () => {
  it("is one PUT for a run of edits, carrying the base it read, and the next carries the base it was answered", async () => {
    const { result } = mount(poster([shape("a")]));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/designer/doc-1");
    expect(init?.method).toBe("PUT");
    const sent = JSON.parse(String(init?.body));
    expect(sent.baseUpdatedAt).toBe("2026-10-03T10:00:00.000Z");
    expect(sent.document.layers[0].frame.rotation).toBe(30);
    expect(result.current.save.kind).toBe("saved");

    act(() => result.current.transform("a", { kind: "rotate", degrees: 0, mode: "to" }));
    await settle();
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).baseUpdatedAt).toBe("2026-10-03T10:00:05.000Z");
  });

  it.each([
    [{ status: 409, body: { status: "locked_region", layerId: "a" } }, "locked", false],
    [{ status: 409, body: { status: "conflict" } }, "conflict", true],
    [{ status: 403, body: {} }, "forbidden", true],
    [{ status: 422, body: { issues: [{ path: "layers.0", code: "bad" }] } }, "invalid", false],
    [{ status: 500, body: {} }, "error", true],
  ] as const)("a %o answer is the state %s, toasted only for the three failures", async (reply, kind, toasted) => {
    const { result } = mount(poster([shape("a")]));
    replies = [reply];
    act(() => result.current.transform("a", { kind: "rotate", degrees: 15, mode: "by" }));
    await settle();
    expect(result.current.save.kind).toBe(kind);
    expect(show).toHaveBeenCalledTimes(toasted ? 1 : 0);
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
