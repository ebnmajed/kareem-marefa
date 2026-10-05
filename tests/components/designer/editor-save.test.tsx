// SCR-057's bar and its draft offer, wired — wave 28, REQ-DSG-036, STORY-DSG-019, STORY-DSG-020, DEC-259 §2.6.
//
// The state machine is pinned by `editor-state.test.tsx`; this renders the editor itself (the canvas engine stubbed,
// it is not under test) to pin what the person sees and presses: the three words on the bar, «احفظ» and ⌘S calling
// the one save, ⌘S never reaching the browser, and — ★ the lead's change to the plan — an editor that is READ-ONLY
// while a draft's offer is unanswered: an edit attempt changes nothing and Save is inert.
import type React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";
import { DesignerEditor, type DesignerEditorProps } from "@/components/designer/editor";
import arDesigner from "@/messages/ar/designer.json";
import arUi from "@/messages/ar/ui.json";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
// The canvas engine draws into an iframe jsdom cannot lay out; it is not what this file tests.
vi.mock("@/components/designer/canvas", () => ({ DesignerCanvas: () => null }));

const poster = (layers: Layer[]): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  layers,
});
const shape = (id: string): Layer => ({ id, name: id, kind: "shape", frame: { x: 200, y: 300, w: 200, h: 100 }, shape: { type: "rect", fill: "{{brand.surface}}" } }) as Layer;

const BASE = "2026-10-03T10:00:00.000Z";
const OWNER = "member-a";

function props(extra: Partial<DesignerEditorProps> = {}): DesignerEditorProps {
  return {
    documentId: "doc-1",
    purpose: "poster",
    initialDocument: poster([shape("a")]),
    initialUpdatedAt: BASE,
    bindings: {},
    declaredBindings: [],
    faces: [],
    lockedLayerIds: [],
    canEdit: true,
    origin: "http://localhost:3000",
    assetSizes: {},
    variantPreviews: {},
    draftOwner: OWNER,
    ...extra,
  };
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arDesigner, ...arUi }}>
    {children}
  </NextIntlClientProvider>
);

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

const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "saved", updatedAt: "2026-10-03T10:00:05.000Z" }) }) as Response);
let memory: MemoryStorage;

beforeEach(() => {
  memory = new MemoryStorage();
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => memory });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  // `document.fonts` does not exist in jsdom; the editor waits on it before measuring.
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: async () => [], ready: Promise.resolve() } });
});
afterEach(() => vi.unstubAllGlobals());

const bar = () => screen.getAllByRole("toolbar")[0]!;
const saveButton = () => screen.getAllByRole("button", { name: "احفظ" })[0] as HTMLButtonElement;

describe("the bar's three words and the one save", () => {
  it("a fresh document says «محفوظ» and Save is disabled; an edit says «غير محفوظ»; «احفظ» sends one PUT and says «محفوظ»", async () => {
    render(<DesignerEditor {...props()} />, { wrapper: Wrap });
    expect(bar().textContent).toContain("محفوظ");
    expect(saveButton().disabled).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "دائرة" })[0]!);
    expect(bar().textContent).toContain("غير محفوظ");
    expect(saveButton().disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bar().textContent).not.toContain("غير محفوظ");
  });

  it("⌘S / Ctrl+S saves, and never reaches the browser's «Save page as» — read-only included", async () => {
    render(<DesignerEditor {...props()} />, { wrapper: Wrap });
    fireEvent.click(screen.getAllByRole("button", { name: "دائرة" })[0]!);
    let event!: KeyboardEvent;
    await act(async () => {
      event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true });
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a read-only editor shows no state word and no Save, and still keeps ⌘S from the browser", () => {
    render(<DesignerEditor {...props({ canEdit: false })} />, { wrapper: Wrap });
    expect(screen.queryAllByRole("button", { name: "احفظ" })).toHaveLength(0);
    expect(bar().textContent).not.toContain("محفوظ");
    const event = new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("★ while a draft's offer is unanswered, nothing is edited (DEC-259 §2.6)", () => {
  const draft = (document: DesignDocument, base = BASE) =>
    memory.setItem(`kareem.designer.draft.v1:${OWNER}:doc-1`, JSON.stringify({ v: 1, documentId: "doc-1", memberId: OWNER, baseUpdatedAt: base, writtenAt: base, document }));

  it("the offer shows; an edit attempt changes nothing; Save and ⌘S are inert; «استعِدها» opens the editor on the draft, unsaved", async () => {
    draft(poster([shape("a"), shape("b")]));
    render(<DesignerEditor {...props()} />, { wrapper: Wrap });
    const offer = screen.getByRole("region", { name: "تعديلات لم تُحفظ" });
    expect(offer.textContent).toContain("لم تُحفظ تعديلاتك في المرة السابقة.");

    const circle = screen.getAllByRole("button", { name: "دائرة" })[0] as HTMLButtonElement;
    expect(circle.disabled).toBe(true);
    fireEvent.click(circle);
    expect(bar().textContent).not.toContain("غير محفوظ");
    expect(saveButton().disabled).toBe(true);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true, bubbles: true }));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // The old draft is untouched while it waits.
    expect(JSON.parse(memory.getItem(`kareem.designer.draft.v1:${OWNER}:doc-1`)!).document.layers).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "استعِدها" }));
    expect(screen.queryByRole("region", { name: "تعديلات لم تُحفظ" })).toBeNull();
    expect(bar().textContent).toContain("غير محفوظ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("★ a stale draft says so and what restoring means; «احذفها» removes it and leaves the server's document", () => {
    draft(poster([shape("a"), shape("b")]), "2026-10-03T09:00:00.000Z");
    render(<DesignerEditor {...props()} />, { wrapper: Wrap });
    const offer = screen.getByRole("region", { name: "تعديلات لم تُحفظ" });
    expect(offer.textContent).toContain("وحُفظت بعدها نسخة أحدث من هذا المستند.");
    expect(offer.textContent).toContain("إن استعدتها وحفظتها حلّت محلّ النسخة الأحدث.");
    fireEvent.click(screen.getByRole("button", { name: "احذفها" }));
    expect(memory.getItem(`kareem.designer.draft.v1:${OWNER}:doc-1`)).toBeNull();
    expect(bar().textContent).toContain("محفوظ");
    expect(bar().textContent).not.toContain("غير محفوظ");
  });
});
