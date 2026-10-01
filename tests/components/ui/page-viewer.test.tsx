// `ui/page-viewer` — SCR-013's page, previous and next, the scrubber, the rail, zoom and the keys (DEC-213 §4,
// REQ-UIX-064, REQ-UIX-065, REQ-MAT-003).
//
// ★ The first eight cases are the old `tests/components/viewer/page-viewer.test.tsx`'s, re-asserted against the
// primitive (DEC-213 §4; each a ledger line in STATUS.md): the expectations are unchanged, the selector moved
// from a test id to the scrubber's own value, and the strings arrive as props built from `ar/materials.json`.
// ★★ Then the direction case that would have caught the live defect (DEC-214 §1), and the rest of the model.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/materials.json";
import en from "@/messages/en/materials.json";
import type { PageViewerLabels, PageViewerPage } from "@/components/ui";
import { PAGE_VIEWER_ZOOM_STEPS, PageViewer, PageViewerZoom, pageViewerKey } from "@/components/ui/page-viewer";

const pages: PageViewerPage[] = [1, 2, 3].map((n) => ({
  pageNumber: n,
  imageUrl: `https://x.test/${n}.webp`,
  thumbnailUrl: `https://x.test/t${n}.webp`,
  width: 1600,
  height: 900,
}));

// The labels a screen builds, from the real catalogue — the `<bdi>` markers stripped for the plain forms.
function labelsFrom(catalogue: typeof ar): PageViewerLabels {
  const v = catalogue.materials.viewer;
  const fill = (template: string, values: Record<string, number>) =>
    template.replace(/<\/?bdi>/g, "").replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
  return {
    previous: v.previous,
    next: v.next,
    scrubber: v.scrubberLabel,
    rail: v.thumbnailsLabel,
    thumbnail: (n) => fill(v.thumbnailLabel, { number: n }),
    pageOf: (c, t) => fill(v.pageOf, { current: c, total: t }),
    pageOfText: (c, t) => fill(v.pageOf, { current: c, total: t }),
    position: (c, t) => fill(v.position, { current: c, total: t }),
    zoomIn: v.zoomIn,
    zoomOut: v.zoomOut,
    stage: v.stageLabel,
    noPages: v.states.noPages,
  };
}

const AR = labelsFrom(ar);

function renderViewer(dir: "rtl" | "ltr" = "rtl", extra: Partial<Parameters<typeof PageViewer>[0]> = {}) {
  return render(<PageViewer pages={pages} dir={dir} title="عرض تجريبي" labels={dir === "rtl" ? AR : labelsFrom(en as unknown as typeof ar)} {...extra} />);
}

const scrubber = () => screen.getByRole("slider");

function expectPage(n: number, of = 3) {
  expect(scrubber()).toHaveValue(String(n));
  expect(scrubber()).toHaveAttribute("aria-valuetext", expect.stringContaining(`${n}`));
  expect(screen.getByRole("status")).toHaveTextContent(new RegExp(`${n}.*${of}|${n} of ${of}`));
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("PageViewer — the old suite's cases, re-asserted (DEC-213 §4)", () => {
  it("starts on page 1 of 3", () => {
    renderViewer();
    expectPage(1);
    expect(scrubber()).toHaveAttribute("aria-valuetext", "صفحة 1 من 3");
  });

  it("★ RTL: the LEFT arrow key advances (reading direction), the RIGHT arrow goes back", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.keyboard("{ArrowLeft}");
    expectPage(2);
    await user.keyboard("{ArrowLeft}");
    expectPage(3);
    await user.keyboard("{ArrowRight}");
    expectPage(2);
  });

  it("★ LTR: the RIGHT arrow key advances, the LEFT arrow goes back — the opposite of RTL", async () => {
    const user = userEvent.setup();
    renderViewer("ltr");
    await user.keyboard("{ArrowRight}");
    expectPage(2);
    await user.keyboard("{ArrowLeft}");
    expectPage(1);
  });

  it("Home and End jump to the first and last page regardless of direction", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.keyboard("{End}");
    expectPage(3);
    await user.keyboard("{Home}");
    expectPage(1);
  });

  it("Page Down advances and Page Up retreats, independent of reading direction", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.keyboard("{PageDown}");
    expectPage(2);
    await user.keyboard("{PageUp}");
    expectPage(1);
  });

  it("never advances past the last page or retreats before the first", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.keyboard("{Home}{ArrowRight}");
    expectPage(1);
    await user.keyboard("{End}{ArrowLeft}");
    expectPage(3);
  });

  it("clicking a thumbnail jumps straight to that page", async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "الانتقال إلى الصفحة 3" }));
    expectPage(3);
  });

  it("renders the no-pages state instead of crashing on an empty list", () => {
    render(<PageViewer pages={[]} dir="rtl" title="فارغ" labels={AR} />);
    expect(screen.getByText("لا توجد صفحات لعرضها.")).toBeInTheDocument();
  });
});

describe("★★ PageViewer — «next» goes the way a reader reads (REQ-UIX-065)", () => {
  it("★ ar: «الصفحة التالية» moves the page from N to N + 1 and sits at the inline-end; «الصفحة السابقة» moves it back", async () => {
    const user = userEvent.setup();
    renderViewer();
    const next = screen.getByRole("button", { name: "الصفحة التالية" });
    const previous = screen.getByRole("button", { name: "الصفحة السابقة" });

    // The fix's proof: on page 1 in Arabic, «next» is ENABLED and «previous» is not — the old file had them swapped.
    expect(next).toBeEnabled();
    expect(previous).toBeDisabled();

    await user.click(next);
    expectPage(2);
    await user.click(next);
    expectPage(3);
    expect(next).toBeDisabled();
    await user.click(previous);
    expectPage(2);
    await user.click(previous);
    expectPage(1);

    // At the inline-end: inside the `dir="rtl"` viewer, «next» follows «previous» in document order, so the
    // direction lays it out at the end — left in Arabic. The e2e measures the boxes.
    const root = next.closest("[data-page-viewer]")!;
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Its glyph points forward — the chevron that mirrors in RTL, so it points left.
    expect(next.querySelector("svg")?.getAttribute("data-direction")).toBe("forward");
    expect(previous.querySelector("svg")?.getAttribute("data-direction")).toBe("back");
  });

  it("«next» is the accent control, «previous» the quiet one", () => {
    renderViewer();
    // `ui/button`'s primary face (the accent inside the scope) and its secondary one.
    expect(screen.getByRole("button", { name: "الصفحة التالية" }).className).toContain("bg-[var(--btn-bg)]");
    expect(screen.getByRole("button", { name: "الصفحة السابقة" }).className).toContain("border-[var(--btn2-border)]");
  });

  it("the same buttons in LTR: «Next page» advances; no button reads the direction", async () => {
    const user = userEvent.setup();
    renderViewer("ltr");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expectPage(2);
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expectPage(1);
  });
});

describe("PageViewer — the keyboard model", () => {
  it("pageViewerKey: ← next and → previous in RTL; the reverse in LTR; the rest direction-free", () => {
    expect(pageViewerKey("ArrowLeft", "rtl")).toBe("next");
    expect(pageViewerKey("ArrowRight", "rtl")).toBe("previous");
    expect(pageViewerKey("ArrowLeft", "ltr")).toBe("previous");
    expect(pageViewerKey("ArrowRight", "ltr")).toBe("next");
    for (const dir of ["rtl", "ltr"] as const) {
      expect(pageViewerKey("PageDown", dir)).toBe("next");
      expect(pageViewerKey("PageUp", dir)).toBe("previous");
      expect(pageViewerKey("Home", dir)).toBe("first");
      expect(pageViewerKey("End", dir)).toBe("last");
      expect(pageViewerKey("a", dir)).toBeNull();
    }
  });

  it("★ a key with Alt, Ctrl or Meta is never the viewer's — Alt+← is the browser's Back (DEC-214 §1)", async () => {
    expect(pageViewerKey("ArrowLeft", "rtl", { altKey: true })).toBeNull();
    expect(pageViewerKey("ArrowLeft", "rtl", { metaKey: true })).toBeNull();
    expect(pageViewerKey("End", "rtl", { ctrlKey: true })).toBeNull();
    renderViewer();
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expectPage(1);
  });

  it("the scrubber applies the same model to its own keys: ← is next on it in RTL", async () => {
    renderViewer();
    fireEvent.keyDown(scrubber(), { key: "ArrowLeft" });
    expectPage(2);
    fireEvent.keyDown(scrubber(), { key: "ArrowRight" });
    expectPage(1);
  });

  it("dragging the scrubber jumps to the page", () => {
    renderViewer();
    fireEvent.change(scrubber(), { target: { value: "3" } });
    expectPage(3);
  });

  it("onKeyActivity hears every key — the screen brings hidden chrome back on any key", async () => {
    const onKeyActivity = vi.fn();
    const user = userEvent.setup();
    renderViewer("rtl", { onKeyActivity });
    await user.keyboard("x");
    expect(onKeyActivity).toHaveBeenCalled();
  });
});

describe("PageViewer — controlled, swipe, tap, zoom, rail", () => {
  it("controlled: page comes from the prop and a move is reported, not taken", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    renderViewer("rtl", { page: 2, onPageChange });
    expectPage(2);
    await user.click(screen.getByRole("button", { name: "الصفحة التالية" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    expectPage(2);
  });

  it("★ swipe: in Arabic a rightward drag advances and a leftward one goes back; in LTR the reverse", () => {
    const { container, unmount } = renderViewer();
    const stage = container.querySelector("img[alt^='عرض تجريبي']")!.parentElement!;
    fireEvent.pointerDown(stage, { pointerId: 1, button: 0, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerId: 1, button: 0, clientX: 220, clientY: 210 });
    expectPage(2);
    fireEvent.pointerDown(stage, { pointerId: 2, button: 0, clientX: 220, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerId: 2, button: 0, clientX: 100, clientY: 200 });
    expectPage(1);
    unmount();

    const ltr = renderViewer("ltr");
    const ltrStage = ltr.container.querySelector("img[alt^='عرض تجريبي']")!.parentElement!;
    fireEvent.pointerDown(ltrStage, { pointerId: 3, button: 0, clientX: 220, clientY: 200 });
    fireEvent.pointerUp(ltrStage, { pointerId: 3, button: 0, clientX: 100, clientY: 200 });
    expectPage(2);
  });

  it("a tap is not a swipe: it calls onStageTap and turns no page", () => {
    const onStageTap = vi.fn();
    const { container } = renderViewer("rtl", { onStageTap });
    const stage = container.querySelector("img[alt^='عرض تجريبي']")!.parentElement!;
    fireEvent.pointerDown(stage, { pointerId: 1, button: 0, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerId: 1, button: 0, clientX: 103, clientY: 202 });
    expect(onStageTap).toHaveBeenCalledTimes(1);
    expectPage(1);
  });

  it("zoom: single-pointer buttons, disabled at the bounds; zoomed, the stage is named and focusable and a swipe pans", async () => {
    const user = userEvent.setup();
    const { container } = renderViewer();
    const zoomIn = screen.getByRole("button", { name: "تكبير" });
    const zoomOut = screen.getByRole("button", { name: "تصغير" });
    expect(zoomOut).toBeDisabled();
    await user.click(zoomIn);
    await user.click(zoomIn);
    expect(zoomIn).toBeDisabled();
    const stage = screen.getByRole("region", { name: AR.stage });
    expect(stage).toHaveAttribute("tabindex", "0");
    const img = container.querySelector<HTMLImageElement>("img[alt^='عرض تجريبي']")!;
    expect(img.style.transform).toBe(`scale(${PAGE_VIEWER_ZOOM_STEPS[2]})`);
    expect(img.style.transformOrigin).toBe("top right");
    fireEvent.pointerDown(stage, { pointerId: 9, button: 0, clientX: 100, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerId: 9, button: 0, clientX: 260, clientY: 200 });
    expectPage(1);
  });

  it("PageViewerZoom draws the same two controls for a screen's own chrome", async () => {
    const onZoomChange = vi.fn();
    const user = userEvent.setup();
    render(<PageViewerZoom zoom={1} onZoomChange={onZoomChange} labels={{ zoomIn: "تكبير", zoomOut: "تصغير" }} />);
    await user.click(screen.getByRole("button", { name: "تصغير" }));
    expect(onZoomChange).toHaveBeenCalledWith(0);
  });

  it("showZoom={false} leaves zoom to the screen", () => {
    renderViewer("rtl", { showZoom: false });
    expect(screen.queryByRole("button", { name: "تكبير" })).toBeNull();
  });

  it("the rail is a labelled list; the current thumbnail is marked; showRail={false} draws none", () => {
    const { unmount } = renderViewer("rtl", { defaultPage: 2 });
    const rail = screen.getByRole("list", { name: "الصفحات" });
    const current = within(rail).getByRole("button", { name: "الانتقال إلى الصفحة 2" });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(within(rail).getByRole("button", { name: "الانتقال إلى الصفحة 1" })).toHaveAttribute("aria-current", "false");
    unmount();
    renderViewer("rtl", { showRail: false });
    expect(screen.queryByRole("list", { name: "الصفحات" })).toBeNull();
  });

  it("the page's alt names the document and the page; ±2 pages are prefetched", () => {
    const { container } = renderViewer("rtl", { defaultPage: 2 });
    expect(container.querySelector("img[alt='عرض تجريبي — صفحة 2 من 3']")).not.toBeNull();
    // React 19 hoists a `<link>` into the document's head.
    const hrefs = [...document.querySelectorAll("link[rel=prefetch]")].map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(["https://x.test/1.webp", "https://x.test/2.webp", "https://x.test/3.webp"]);
  });

  it("a one-page document: both buttons disabled, the scrubber too", () => {
    render(<PageViewer pages={pages.slice(0, 1)} dir="rtl" title="ورقة" labels={AR} />);
    expect(screen.getByRole("button", { name: "الصفحة التالية" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeDisabled();
    expect(scrubber()).toBeDisabled();
  });

  it("has no accessibility violation", async () => {
    const { container } = renderViewer();
    await expectAccessible(container);
  });
});
