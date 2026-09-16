// ★ DEC-096's one test: «apply "align start" to the same Arabic poster from an
// `ar` console and from an `en` console, and assert the two stored documents
// are byte-identical» (REQ-DSG-028's third acceptance).
//
// The runtime's `alignLayer()` takes no direction, so the risk is not there —
// it is in the INSPECTOR, which could map a button to «left» or «right» by the
// console's own direction. This mounts the real inspector in each console, in
// each document direction, presses the start button by its visible name, runs
// the op it hands back through the runtime, and compares the bytes.
import type React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { alignLayer, fitLayerToSafeArea, reorderLayer, type DesignDocument, type Layer } from "@kareem/designer-runtime";
import { Inspector, type ArrangeOp } from "@/components/designer/inspector";
import arDesigner from "@/messages/ar/designer.json";
import enDesigner from "@/messages/en/designer.json";
import arUi from "@/messages/ar/ui.json";
import enUi from "@/messages/en/ui.json";

afterEach(cleanup);

const title: Layer = {
  id: "l_title",
  kind: "text",
  frame: { x: 300, y: 400, w: 500, h: 120 },
  text: { binding: "session.title", fallback: "عنوان الجلسة" },
  font: { family: "Reem Kufi", size: 96 },
  align: "start",
  color: "{{brand.fgHeading}}",
} as Layer;

const poster: DesignDocument = {
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px", dpi: 72 },
  direction: "rtl",
  background: { type: "gradient", angle: 140, stops: [{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }] },
  layers: [title],
};

function apply(doc: DesignDocument, layerId: string, op: ArrangeOp): DesignDocument {
  if (op.kind === "align") return alignLayer(doc, layerId, op.axis, op.edge, op.target);
  if (op.kind === "fit") return fitLayerToSafeArea(doc, layerId);
  return reorderLayer(doc, layerId, op.move);
}

async function pressIn(locale: "ar" | "en", console: "rtl" | "ltr", doc: DesignDocument, groupName: string, buttonName: string) {
  const onArrange = vi.fn<(layerId: string, op: ArrangeOp) => void>();
  const messages = locale === "ar" ? { ...arDesigner, ...arUi } : { ...enDesigner, ...enUi };
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div dir={console}>{children}</div>
    </NextIntlClientProvider>
  );
  const { container } = render(
    <Inspector
      document={doc}
      layer={doc.layers[0]!}
      locked={false}
      canEdit
      fontFamilies={["Reem Kufi"]}
      onPatchLayer={() => undefined}
      onArrange={onArrange}
      onDocument={() => undefined}
    />,
    { wrapper: Wrap },
  );
  const group = screen.getByRole("group", { name: groupName });
  await userEvent.click(within(group).getByRole("button", { name: buttonName }));
  expect(onArrange).toHaveBeenCalledTimes(1);
  const [layerId, op] = onArrange.mock.calls[0]!;
  const stored = JSON.stringify(apply(doc, layerId, op));
  cleanup();
  return { stored, container };
}

describe("DEC-096 — align follows the DOCUMENT's axis, never the console's", () => {
  it("★ «align start» on an Arabic poster stores byte-identical documents from an ar console and an en console", async () => {
    const fromArabic = await pressIn("ar", "rtl", poster, arDesigner.designer.inspector.align.inline, arDesigner.designer.inspector.align.start);
    const fromEnglish = await pressIn("en", "ltr", poster, enDesigner.designer.inspector.align.inline, enDesigner.designer.inspector.align.start);
    expect(fromEnglish.stored).toBe(fromArabic.stored);
    // And «start» is the document's inline start — the safe box's start edge.
    expect(JSON.parse(fromArabic.stored).layers[0].frame.x).toBe(80);
  });

  it("holds for every edge on both axes, and for an LTR document opened in either console", async () => {
    const cases: Array<[keyof typeof arDesigner.designer.inspector.align, "inline" | "block"]> = [
      ["start", "inline"],
      ["center", "inline"],
      ["end", "inline"],
      ["top", "block"],
      ["middle", "block"],
      ["bottom", "block"],
    ];
    for (const doc of [poster, { ...poster, direction: "ltr" as const }]) {
      for (const [key, axis] of cases) {
        const group = axis === "inline" ? "inline" : "block";
        const ar = await pressIn("ar", "rtl", doc, arDesigner.designer.inspector.align[group], arDesigner.designer.inspector.align[key]);
        const en = await pressIn("en", "ltr", doc, enDesigner.designer.inspector.align[group], enDesigner.designer.inspector.align[key]);
        expect(en.stored, `${doc.direction} ${axis} ${key}`).toBe(ar.stored);
      }
    }
  });

  it("the inspector is accessible — every group named, every control labelled", async () => {
    const messages = { ...arDesigner, ...arUi };
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <main dir="rtl">
          <Inspector
            document={poster}
            layer={poster.layers[0]!}
            locked={false}
            canEdit
            fontFamilies={["Reem Kufi"]}
            onPatchLayer={() => undefined}
            onArrange={() => undefined}
            onDocument={() => undefined}
          />
        </main>
      </NextIntlClientProvider>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("DEC-093 — the numbers are demoted, never removed", () => {
  it("«الموضع والحجم» starts closed, opens with one tap, and carries X, Y, W, H and rotation", async () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ ...arDesigner, ...arUi }}>
        <Inspector
          document={poster}
          layer={poster.layers[0]!}
          locked={false}
          canEdit
          fontFamilies={["Reem Kufi"]}
          onPatchLayer={() => undefined}
          onArrange={() => undefined}
          onDocument={() => undefined}
        />
      </NextIntlClientProvider>,
    );
    const toggle = screen.getByRole("button", { name: arDesigner.designer.inspector.sections.position });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const P = arDesigner.designer.properties;
    for (const label of [P.x, P.y, P.w, P.h, P.rotation]) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
});
