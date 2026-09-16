// SCR-059's form — REQ-DSG-021, REQ-ADM-015. Real ar/branding.json through
// NextIntlClientProvider. `saveAction`/`resetAction`/`signPreview` are
// mocked (they are Server Actions in production); the point of this file is
// the CLIENT behaviour: the live preview and the contrast badges track the
// controlled colour state, and the reset flow requires an explicit confirm.
//
// `browse.json`'s `fileDrop` namespace is merged in too — `ui/file-drop`
// (the logo picker) reads it, and `NextIntlClientProvider` here only ever
// carries what this file hands it, unlike the real app's fully-merged
// catalogue.
//
// `userEvent`, not `fireEvent`, for the tab switch: `ui/tabs`' Radix
// trigger activates on `onMouseDown`/`onFocus`, never `onClick`
// (`@radix-ui/react-tabs`) — `fireEvent.click` dispatches a bare `click`
// with no preceding `mousedown`, so it never reaches Radix's handler and
// the tab silently never switches. Every other interaction below is a
// plain `<button onClick>` (`ui/button`, `ui/dialog`'s close), where
// `fireEvent.click` is the house convention (`deactivation-form.test.tsx`).
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/branding.json";
import browseAr from "@/messages/ar/browse.json";
import { BrandKitForm } from "@/components/branding/brand-kit-form";
import type { BrandKit } from "@/lib/brand/schema";

const LIGHT = {
  canvas: "#ffffff",
  surface: "#ffffff",
  fgHeading: "#0b1220",
  fgBody: "#33415c",
  fgMuted: "#5b6780",
  edge: "#e6eaf0",
  edgeStrong: "#767f8c",
  spine: "#d7dce3",
  node: "#0b1220",
  // DEC-127, contract 1 — canvasRaise is now required by BrandColourSet.
  canvasRaise: "#f1f3f7",
};
const DARK = { ...LIGHT, canvas: "#0b1220", surface: "#111a2c", fgHeading: "#ffffff", canvasRaise: "#1d2a42" };

const KIT: BrandKit = {
  orgId: "11111111-1111-1111-1111-111111111111",
  isOverridden: false,
  light: LIGHT,
  dark: DARK,
  logo: null,
  headingFont: null,
  bodyFont: null,
  updatedAt: null,
  updatedBy: null,
};

const ORG_NAME = "مؤسسة الاختبار";

/** jsdom normalises an inline `background-image` colour to `rgb(...)`
 *  rather than echoing the hex it was set with. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...ar, ...browseAr }}>
      <BrandKitForm
        locale="ar"
        kit={KIT}
        fonts={[]}
        logoPreviewUrl={null}
        imageLimitMb={20}
        orgName={ORG_NAME}
        saveAction={vi.fn(async (prev) => prev)}
        resetAction={vi.fn(async (prev) => prev)}
        signPreview={vi.fn(async () => null)}
      />
    </NextIntlClientProvider>,
  );
}

describe("BrandKitForm", () => {
  it("★ the live preview tracks the controlled colour state — typing a new heading colour updates the preview immediately", () => {
    renderForm();
    const headingInput = screen.getByLabelText(ar.branding.colours.tokens.fgHeading) as HTMLInputElement;
    fireEvent.change(headingInput, { target: { value: "#ff0000" } });
    expect(headingInput.value).toBe("#ff0000");

    const heading = screen.getByText(ar.branding.preview.headingSample);
    expect(heading).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });

  it("switching to the dark tab edits the dark set without losing the light edits", async () => {
    renderForm();
    const headingInput = screen.getByLabelText(ar.branding.colours.tokens.fgHeading) as HTMLInputElement;
    fireEvent.change(headingInput, { target: { value: "#ff0000" } });

    await userEvent.click(screen.getByRole("tab", { name: ar.branding.colours.schemeDark }));
    const darkHeadingInput = screen.getByLabelText(ar.branding.colours.tokens.fgHeading) as HTMLInputElement;
    expect(darkHeadingInput.value).toBe(DARK.fgHeading); // unaffected by the light-tab edit

    await userEvent.click(screen.getByRole("tab", { name: ar.branding.colours.schemeLight }));
    expect((screen.getByLabelText(ar.branding.colours.tokens.fgHeading) as HTMLInputElement).value).toBe("#ff0000");
  });

  it("★ a low-contrast pair shows the failing ratio, refused rather than merely noted", () => {
    renderForm();
    const bodyInput = screen.getByLabelText(ar.branding.colours.tokens.fgBody) as HTMLInputElement;
    // #eeeeee on white is well under the 4.5:1 body threshold.
    fireEvent.change(bodyInput, { target: { value: "#eeeeee" } });

    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => el.textContent?.includes("4.5"))).toBe(true);
  });

  it("reset requires an explicit confirmation step before the button that actually submits appears", () => {
    renderForm();
    const resetButtons = screen.getAllByText(ar.branding.actions.reset);
    fireEvent.click(resetButtons[resetButtons.length - 1]);

    expect(screen.getByText(ar.branding.actions.resetConfirm)).toBeInTheDocument();
    expect(screen.getByText(ar.branding.actions.cancel)).toBeInTheDocument();

    fireEvent.click(screen.getByText(ar.branding.actions.cancel));
    expect(screen.queryByText(ar.branding.actions.resetConfirm)).not.toBeInTheDocument();
  });

  it("★ REQ-UIX-013: the reset dialog names the org, not 'your organisation' generically", () => {
    renderForm();
    const resetButtons = screen.getAllByText(ar.branding.actions.reset);
    fireEvent.click(resetButtons[resetButtons.length - 1]);
    expect(screen.getByRole("dialog")).toHaveTextContent(ORG_NAME);
  });

  it("the colour swatch and the hex text field stay in sync for the same token", () => {
    renderForm();
    const headingInput = screen.getByLabelText(ar.branding.colours.tokens.fgHeading) as HTMLInputElement;
    const field = headingInput.closest("div") as HTMLElement;
    const swatch = field.querySelector('input[type="color"]') as HTMLInputElement;
    expect(swatch.value).toBe(headingInput.value);

    fireEvent.change(headingInput, { target: { value: "#ff00ff" } });
    expect(swatch.value).toBe("#ff00ff");
  });

  it("★ the poster-gradient swatch always uses the DARK palette, never the active (light) tab", () => {
    renderForm();
    const caption = screen.getByText(ar.branding.preview.posterGradientLabel);
    const swatch = caption.parentElement as HTMLElement;
    const expected = `linear-gradient(140deg, ${hexToRgb(DARK.surface)}, ${hexToRgb(DARK.canvasRaise)})`;
    expect(swatch.style.backgroundImage).toBe(expected);

    // Editing the LIGHT scheme's own canvasRaise (the active tab by
    // default) must not move the swatch — a generated poster renders
    // `scheme: 'dark'` unconditionally (DEC-125), so the light token
    // reaches nothing the swatch represents.
    const lightCanvasRaise = screen.getByLabelText(ar.branding.colours.tokens.canvasRaise) as HTMLInputElement;
    fireEvent.change(lightCanvasRaise, { target: { value: "#ff00ff" } });
    expect(swatch.style.backgroundImage).toBe(expected);
  });
});
