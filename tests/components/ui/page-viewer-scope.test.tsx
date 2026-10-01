// `<PageViewer>` inside the playground's scope — REQ-UIX-064. Born inside it: semantic names only, no motion, an
// RTL check, and every state passing axe on the scope's ground. `page-viewer.test.tsx` is the behaviour.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { PageViewerLabels, PageViewerPage } from "@/components/ui";
import { PageViewer, PageViewerZoom } from "@/components/ui/page-viewer";

// `ui/icon-button` is the lead's, with its own scope test; this file checks what page-viewer draws itself. An
// icon button is the one `<button>` here with no `aria-current` (the rail's thumbnails carry one).
const own = (root: Element) => [...root.querySelectorAll("[class]")].filter((el) => !el.closest("button:not([aria-current])"));

const RAW = /\b(?:navy|silver|slate)-|#[0-9a-fA-F]{3,8}\b|\bduration-\d|\b(?:bg|text|border)-(?:black|white)\b/;

const pages: PageViewerPage[] = [1, 2, 3, 4].map((n) => ({
  pageNumber: n,
  imageUrl: `https://x.test/${n}.webp`,
  thumbnailUrl: `https://x.test/t${n}.webp`,
  width: 1600,
  height: 1200,
}));

const labels: PageViewerLabels = {
  previous: "الصفحة السابقة",
  next: "الصفحة التالية",
  scrubber: "الانتقال إلى صفحة",
  rail: "الصفحات",
  thumbnail: (n) => `الانتقال إلى الصفحة ${n}`,
  pageOf: (c, t) => (
    <>
      صفحة <bdi>{c}</bdi> من <bdi>{t}</bdi>
    </>
  ),
  pageOfText: (c, t) => `صفحة ${c} من ${t}`,
  position: (c, t) => (
    <>
      <bdi>{c}</bdi> من <bdi>{t}</bdi>
    </>
  ),
  zoomIn: "تكبير",
  zoomOut: "تصغير",
  stage: "الصفحة مكبَّرة",
  noPages: "لا توجد صفحات لعرضها.",
};

function inScope(ui: React.ReactNode) {
  return render(
    <div className="theme-play" dir="rtl">
      {ui}
    </div>,
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("PageViewer inside the scope", () => {
  it("every class it draws is a semantic name: no raw palette, no hex, no black, no literal duration", () => {
    const { container } = inScope(
      <>
        <PageViewer pages={pages} dir="rtl" title="عرض" labels={labels} defaultPage={2} />
        <PageViewerZoom zoom={1} onZoomChange={() => {}} labels={labels} />
      </>,
    );
    for (const el of own(container)) expect(el.getAttribute("class"), el.tagName).not.toMatch(RAW);
  });

  it("the chrome reads the bars' token, and the current thumbnail the accent", () => {
    const { container } = inScope(<PageViewer pages={pages} dir="rtl" title="عرض" labels={labels} defaultPage={3} />);
    expect(container.querySelector("[data-page-viewer-rail]")).toHaveClass("bg-chrome");
    for (const el of container.querySelectorAll("[data-page-viewer-controls]")) expect(el).toHaveClass("bg-chrome");
    const current = screen.getByRole("button", { name: "الانتقال إلى الصفحة 3" });
    expect(current).toHaveClass("text-accent");
    expect(current.querySelector("img")).toHaveClass("outline-accent");
  });

  it("nothing animates and nothing scales on hover — a page changes by a cut (DEC-214 §3, N5)", () => {
    const { container } = inScope(<PageViewer pages={pages} dir="rtl" title="عرض" labels={labels} />);
    for (const el of own(container)) expect(el.getAttribute("class"), el.tagName).not.toMatch(/hover:scale|animate-|transition/);
  });

  it("RTL: the viewer carries the direction it was given; the rail comes first, at the inline-start", () => {
    const { container } = inScope(<PageViewer pages={pages} dir="rtl" title="عرض" labels={labels} />);
    const root = container.querySelector("[data-page-viewer]")!;
    expect(root).toHaveAttribute("dir", "rtl");
    const kids = [...root.children].filter((c) => c.tagName === "DIV" && !c.getAttribute("role"));
    expect(kids[0]).toHaveAttribute("data-page-viewer-rail");
  });

  it.each([
    ["first page", { defaultPage: 1 }],
    ["middle page", { defaultPage: 2 }],
    ["last page", { defaultPage: 4 }],
    ["zoomed", { defaultZoom: 2 }],
  ] as const)("is accessible on the %s", async (_name, extra) => {
    const { container } = inScope(<PageViewer pages={pages} dir="rtl" title="عرض" labels={labels} {...extra} />);
    await expectAccessible(container);
  });

  it("is accessible with no pages", async () => {
    const { container } = inScope(<PageViewer pages={[]} dir="rtl" title="عرض" labels={labels} />);
    await expectAccessible(container);
  });
});
