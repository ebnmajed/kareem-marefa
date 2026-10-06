// DEC-272 (the owner, 2026-10-06): a template's colours are fully editable, and the brand's colours are a quick select.
// The control stores a LINKED brand binding from a swatch, the LITERAL from the picker or the hex field, and refuses a
// malformed code at the field — never storing it.
import type React from "react";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColourControl, normaliseHex } from "@/components/designer/colour-control";
import { Inspector } from "@/components/designer/inspector";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";
import arDesigner from "@/messages/ar/designer.json";
import arUi from "@/messages/ar/ui.json";

afterEach(cleanup);

const bg = arDesigner.designer.inspector.background;
const tc = arDesigner.designer.inspector.colour;

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arDesigner, ...arUi }}>
    <div dir="rtl">{children}</div>
  </NextIntlClientProvider>
);

function mount(value: string, onValue = vi.fn<(next: string) => void>(), values: Record<string, string> = { "brand.canvas": "#112233" }) {
  render(<ColourControl label="لون النص" value={value} disabled={false} onValue={onValue} values={values} />, { wrapper: Wrap });
  return onValue;
}

const group = () => screen.getByRole("group", { name: "لون النص" });

describe("ColourControl — DEC-272", () => {
  it("★ a brand swatch stores the LINKED binding, exactly as the old select did", async () => {
    const onValue = mount("{{brand.fgHeading}}");
    const brand = within(group()).getByRole("radiogroup", { name: bg.groups.brand });
    expect(within(brand).getByRole("radio", { name: bg.tokens.fgHeading })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(brand).getByRole("radio", { name: bg.tokens.canvas }));
    expect(onValue).toHaveBeenLastCalledWith("{{brand.canvas}}");
  });

  it("a design swatch stores the design binding", async () => {
    const onValue = mount("{{brand.fgHeading}}");
    const design = within(group()).getByRole("radiogroup", { name: bg.groups.design });
    await userEvent.click(within(design).getByRole("radio", { name: bg.designTokens.tangerine }));
    expect(onValue).toHaveBeenLastCalledWith("{{design.tangerine}}");
  });

  it("the swatches are one tab stop each and the arrows follow the page's direction", async () => {
    const onValue = mount("{{brand.canvas}}");
    const brand = within(group()).getByRole("radiogroup", { name: bg.groups.brand });
    const radios = within(brand).getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    // jsdom computes no `direction` from `dir`, so the LTR key is «forward» here; the RTL mapping is the same code path.
    fireEvent.keyDown(radios[0]!, { key: "ArrowDown" });
    expect(onValue).toHaveBeenLastCalledWith(`{{brand.${"surface"}}}`);
    expect(document.activeElement).toBe(radios[1]);
  });

  it("★ a typed hex stores the LITERAL, lower-cased", async () => {
    const onValue = mount("{{brand.fgHeading}}");
    const hex = within(group()).getByRole("textbox", { name: tc.hex });
    expect(hex).toHaveAttribute("dir", "ltr");
    await userEvent.type(hex, "#FF9A2E");
    expect(onValue).toHaveBeenLastCalledWith("#ff9a2e");
  });

  it("the native picker stores the literal too", () => {
    const onValue = mount("{{brand.fgHeading}}");
    fireEvent.change(within(group()).getByLabelText(tc.picker), { target: { value: "#35d0ff" } });
    expect(onValue).toHaveBeenLastCalledWith("#35d0ff");
  });

  it("★ an invalid hex is refused AT THE FIELD and never stored", async () => {
    const onValue = mount("{{brand.fgHeading}}");
    const hex = within(group()).getByRole("textbox", { name: tc.hex });
    await userEvent.type(hex, "#12zz");
    await userEvent.tab();
    expect(onValue).not.toHaveBeenCalled();
    expect(hex).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByText("#rrggbb", { selector: "bdi" });
    expect(error).toHaveAttribute("dir", "ltr");
  });

  it("the current value is said in words: a token by its name, a literal by its code in <bdi dir=ltr>", () => {
    mount("{{brand.canvas}}");
    expect(within(group()).getByText(bg.tokens.canvas, { selector: "p span" })).toBeInTheDocument();
    cleanup();
    mount("#ff9a2e");
    expect(within(group()).getByText("#ff9a2e", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    expect(within(group()).getByRole("textbox", { name: tc.hex })).toHaveValue("#ff9a2e");
    expect(within(group()).queryAllByRole("radio", { checked: true })).toHaveLength(0);
  });

  it("a legacy colour that is neither a token nor a hex still shows as what it is", () => {
    mount("rgb(1, 2, 3)");
    expect(within(group()).getByText("rgb(1, 2, 3)", { selector: "bdi" })).toBeInTheDocument();
  });

  it("normaliseHex accepts #rrggbb with or without the hash, and nothing else", () => {
    expect(normaliseHex("FF9A2E")).toBe("#ff9a2e");
    expect(normaliseHex(" #ff9a2e ")).toBe("#ff9a2e");
    expect(normaliseHex("#fff")).toBeNull();
    expect(normaliseHex("#gg9a2e")).toBeNull();
  });
});

describe("Inspector — the background and a text layer use the free colour control (DEC-272)", () => {
  const title = {
    id: "l_title",
    kind: "text",
    frame: { x: 0, y: 0, w: 100, h: 50 },
    text: { fallback: "عنوان" },
    font: { family: "Reem Kufi", size: 48 },
    color: "{{brand.fgHeading}}",
  } as Layer;
  const doc: DesignDocument = {
    schemaVersion: 1,
    purpose: "poster",
    master: { width: 1080, height: 1350, unit: "px", dpi: 72 },
    direction: "rtl",
    background: { type: "solid", color: "{{brand.canvas}}" },
    layers: [title],
  };

  it("a typed hex on the background stores the literal in the document", async () => {
    const onDocument = vi.fn<(next: DesignDocument) => void>();
    render(
      <Inspector document={doc} layer={null} locked={false} canEdit fontFamilies={["Reem Kufi"]} onPatchLayer={() => undefined} onArrange={() => undefined} onDocument={onDocument} />,
      { wrapper: Wrap },
    );
    const control = screen.getByRole("group", { name: bg.colour });
    await userEvent.type(within(control).getByRole("textbox", { name: tc.hex }), "#0b0c12");
    expect(onDocument).toHaveBeenLastCalledWith({ ...doc, background: { type: "solid", color: "#0b0c12" } });
  });

  it("a brand swatch on a text layer patches the layer with the binding", async () => {
    const onPatchLayer = vi.fn();
    render(
      <Inspector document={doc} layer={title} locked={false} canEdit fontFamilies={["Reem Kufi"]} onPatchLayer={onPatchLayer} onArrange={() => undefined} onDocument={() => undefined} />,
      { wrapper: Wrap },
    );
    const control = screen.getByRole("group", { name: arDesigner.designer.properties.colour });
    await userEvent.click(within(control).getByRole("radio", { name: bg.tokens.fgMuted }));
    expect(onPatchLayer).toHaveBeenLastCalledWith("l_title", { color: "{{brand.fgMuted}}" });
  });
});
