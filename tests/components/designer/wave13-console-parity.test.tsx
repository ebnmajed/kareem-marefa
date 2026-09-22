// ★ DEC-096 for wave 13's new operations — REQ-DSG-028's third acceptance,
// extended: «applying "align start" to the same document from an `ar` console
// and an `en` console stores BYTE-IDENTICAL results». Wave 8's
// `inspector-align.test.tsx` holds it for one layer; this holds it for a GROUP
// (align to the selection, distribute) and for a NUDGE, in both document
// directions. The risk is never the runtime (it takes no direction) — it is the
// panel mapping a word to «left» or «right» by the console's own direction.
import type React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { alignLayers, distributeLayers, nudgeLayers, type DesignDocument, type Layer } from "@kareem/designer-runtime";
import { Inspector, type GroupOp } from "@/components/designer/inspector";
import { DesignerCanvas } from "@/components/designer/canvas";
import arDesigner from "@/messages/ar/designer.json";
import enDesigner from "@/messages/en/designer.json";
import arUi from "@/messages/ar/ui.json";
import enUi from "@/messages/en/ui.json";

afterEach(cleanup);
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

const shape = (id: string, x: number, y: number, w: number): Layer =>
  ({ id, name: id, kind: "shape", frame: { x, y, w, h: 40 }, shape: { type: "rect", fill: "{{brand.surface}}" } }) as Layer;

const doc = (direction: "rtl" | "ltr"): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction,
  layers: [shape("a", 120, 200, 100), shape("b", 400, 500, 200), shape("c", 700, 900, 50)],
});

const LABELS = {
  ar: { inline: "أفقيًا", start: "البداية", distribute: "وزّع أفقيًا" },
  en: { inline: "Horizontally", start: "Start", distribute: "Distribute horizontally" },
};

function wrap(locale: "ar" | "en") {
  const messages = locale === "ar" ? { ...arDesigner, ...arUi } : { ...enDesigner, ...enUi };
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>{children}</div>
    </NextIntlClientProvider>
  );
  return Wrap;
}

async function groupOp(locale: "ar" | "en", d: DesignDocument, press: "start" | "distribute"): Promise<string> {
  const onGroupArrange = vi.fn<(op: GroupOp) => void>();
  render(
    <Inspector
      document={d}
      layer={null}
      locked={false}
      canEdit
      fontFamilies={[]}
      onPatchLayer={() => undefined}
      onArrange={() => undefined}
      onDocument={() => undefined}
      selection={d.layers}
      onGroupArrange={onGroupArrange}
    />,
    { wrapper: wrap(locale) },
  );
  const l = LABELS[locale];
  if (press === "start") await userEvent.click(within(screen.getByRole("group", { name: l.inline })).getByRole("button", { name: l.start }));
  else await userEvent.click(screen.getByRole("button", { name: l.distribute }));
  const op = onGroupArrange.mock.calls[0]?.[0] as GroupOp;
  const ids = d.layers.map((x) => x.id);
  const next = op.kind === "align" ? alignLayers(d, ids, op.axis, op.edge, op.target) : distributeLayers(d, ids, op.axis);
  cleanup();
  return JSON.stringify(next);
}

function nudged(locale: "ar" | "en", d: DesignDocument): string {
  const onNudge = vi.fn<(dx: number, dy: number) => void>();
  render(
    <DesignerCanvas
      document={d}
      source={d}
      bindings={{}}
      faces={[]}
      origin="http://localhost:3000"
      selectedLayerIds={["a"]}
      onSelect={() => undefined}
      onFrames={() => undefined}
      onNudge={onNudge}
      lockedLayerIds={[]}
      placeholderLabel={(b) => b}
      preset="master"
      showOverlays={false}
    />,
    { wrapper: wrap(locale) },
  );
  fireEvent.keyDown(screen.getAllByRole("button", { pressed: true })[0] as HTMLElement, { key: "ArrowRight", shiftKey: true });
  const [dx, dy] = onNudge.mock.calls[0] as [number, number];
  cleanup();
  return JSON.stringify(nudgeLayers(d, ["a"], dx, dy));
}

describe("★ an ar console and an en console store the same bytes", () => {
  it.each(["rtl", "ltr"] as const)("group «align start» to the selection, on an %s document", async (direction) => {
    const d = doc(direction);
    expect(await groupOp("ar", d, "start")).toBe(await groupOp("en", d, "start"));
    // And it did something: `a`, `b` and `c` now share the selection's start.
    expect(JSON.parse(await groupOp("ar", d, "start")).layers.map((x: Layer) => x.frame.x)).toEqual([120, 120, 120]);
  });

  it.each(["rtl", "ltr"] as const)("distribute horizontally, on an %s document", async (direction) => {
    const d = doc(direction);
    expect(await groupOp("ar", d, "distribute")).toBe(await groupOp("en", d, "distribute"));
  });

  it.each(["rtl", "ltr"] as const)("shift + → nudges the same way from either console, on an %s document — the VISUAL axis", (direction) => {
    const d = doc(direction);
    const ar = nudged("ar", d);
    expect(ar).toBe(nudged("en", d));
    // → is right on the screen: a smaller x on an RTL page, a larger one on an LTR page.
    expect(JSON.parse(ar).layers[0].frame.x).toBe(direction === "rtl" ? 110 : 130);
  });
});
