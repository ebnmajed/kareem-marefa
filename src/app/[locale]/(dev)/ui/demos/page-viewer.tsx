"use client";

import type { PageViewerLabels, PageViewerPage } from "@/components/ui";
import { PageViewer, PageViewerZoom } from "@/components/ui/page-viewer";

// The gallery's `page-viewer` demo — contract 2 (DEC-213 §4, REQ-UIX-064). Every state, in Arabic, from literal
// fixtures: no DAL, no session, no catalogue. The pages are the site's own static images, so nothing is signed.
// A client module because the labels' formatters are functions (DEC-159, DEC-214 §3). The lead renders it
// inside the playground's scope; each viewer sits in a framed box with a height, as the viewer's screen gives it.

const IMAGES = ["/og.png", "/constellation-1.png", "/constellation-2.png", "/constellation-3.png", "/constellation-4.png"] as const;

const PAGES: PageViewerPage[] = IMAGES.map((src, i) => ({
  pageNumber: i + 1,
  imageUrl: src,
  thumbnailUrl: src,
  width: i === 0 ? 1200 : 2880,
  height: i === 0 ? 630 : 1440,
}));

const AR: PageViewerLabels = {
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

const EN: PageViewerLabels = {
  ...AR,
  previous: "Previous page",
  next: "Next page",
  scrubber: "Go to page",
  rail: "Pages",
  thumbnail: (n) => `Go to page ${n}`,
  pageOf: (c, t) => `Page ${c} of ${t}`,
  pageOfText: (c, t) => `Page ${c} of ${t}`,
  position: (c, t) => `${c} of ${t}`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  stage: "The page, zoomed",
  noPages: "No pages to show.",
};

function Frame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="h-[420px] overflow-hidden rounded-panel border border-edge bg-void">{children}</div>
      <figcaption className="text-caption text-fg-muted">{caption}</figcaption>
    </figure>
  );
}

export function PageViewerDemo() {
  return (
    <div data-demo="page-viewer" className="flex flex-col gap-6">
      <Frame caption="الصفحة الأولى — «التالية» عند نهاية السطر، و«السابقة» معطّلة">
        <PageViewer pages={PAGES} dir="rtl" title="عرض تجريبي" labels={AR} />
      </Frame>
      <Frame caption="صفحة في المنتصف، مع شريط الصفحات من عرض سطح المكتب">
        <PageViewer pages={PAGES} dir="rtl" title="عرض تجريبي" labels={AR} defaultPage={3} />
      </Frame>
      <Frame caption="الصفحة الأخيرة — «التالية» معطّلة">
        <PageViewer pages={PAGES} dir="rtl" title="عرض تجريبي" labels={AR} defaultPage={5} />
      </Frame>
      <Frame caption="مكبَّرة ×2 — الصفحة تُسحب داخل إطارها، ولا تُقلَب بالسحب">
        <PageViewer pages={PAGES} dir="rtl" title="عرض تجريبي" labels={AR} defaultPage={2} defaultZoom={2} />
      </Frame>
      <Frame caption="صفحة واحدة">
        <PageViewer pages={PAGES.slice(0, 1)} dir="rtl" title="ورقة واحدة" labels={AR} />
      </Frame>
      <Frame caption="لا صفحات">
        <PageViewer pages={[]} dir="rtl" title="فارغ" labels={AR} />
      </Frame>
      <Frame caption="LTR — the same buttons; → is next">
        <PageViewer pages={PAGES} dir="ltr" title="Demo deck" labels={EN} defaultPage={2} />
      </Frame>
      <div className="flex items-center gap-3">
        <PageViewerZoom zoom={1} onZoomChange={() => {}} labels={AR} />
        <span className="text-caption text-fg-muted">أزرار التكبير في شريط الشاشة نفسها</span>
      </div>
    </div>
  );
}
