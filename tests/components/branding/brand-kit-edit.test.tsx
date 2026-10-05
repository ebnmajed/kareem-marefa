// SCR-059 in edit mode — REQ-UIX-116, REQ-DSG-021, REQ-ADM-015, DEC-231 §3. Real ar/branding.json; the Server Actions
// and the router are mocked. ★ The first eight cases are `brand-kit-form.test.tsx`'s, re-homed one-for-one when its
// file was deleted (DEC-208, the ledger in STATUS.md); the rest are the read-mode pattern and the database's refusal.
//
// `userEvent` for the tab switch: Radix's tab trigger activates on mousedown/focus, never a bare click.
import { NextIntlClientProvider } from "next-intl";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/branding.json";
import browseAr from "@/messages/ar/browse.json";
import uiAr from "@/messages/ar/ui.json";
import type { BrandKit } from "@/lib/brand/schema";
import type { SaveBrandKitState } from "@/app/[locale]/app/admin/branding/actions";

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { BrandKitEdit } = await import("@/components/branding/brand-kit-edit");

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
const t = ar.branding;

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function renderEdit(saveAction: (prev: SaveBrandKitState, fd: FormData) => Promise<SaveBrandKitState> = vi.fn(async (prev) => prev)) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...ar, ...browseAr, ...uiAr }}>
      <BrandKitEdit
        locale="ar"
        kit={KIT}
        fonts={[]}
        logoPreviewUrl={null}
        imageLimitMb={20}
        orgName={ORG_NAME}
        saveAction={saveAction}
        resetAction={vi.fn(async (prev) => prev)}
        signPreview={vi.fn(async () => null)}
      />
    </NextIntlClientProvider>,
  );
}

const field = (token: keyof typeof LIGHT) => screen.getByLabelText(t.colours.tokens[token], { exact: false }) as HTMLInputElement;

describe("BrandKitEdit — the eight cases of the deleted form", () => {
  it("★ the live preview tracks the controlled colour state", () => {
    renderEdit();
    fireEvent.change(field("fgHeading"), { target: { value: "#ff0000" } });
    expect(field("fgHeading").value).toBe("#ff0000");
    expect(screen.getByText(t.preview.headingSample)).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });

  it("switching to the dark tab edits the dark set without losing the light edits", async () => {
    renderEdit();
    fireEvent.change(field("fgHeading"), { target: { value: "#ff0000" } });
    await userEvent.click(screen.getByRole("tab", { name: t.colours.schemeDark }));
    expect(field("fgHeading").value).toBe(DARK.fgHeading);
    await userEvent.click(screen.getByRole("tab", { name: t.colours.schemeLight }));
    expect(field("fgHeading").value).toBe("#ff0000");
  });

  it("★ a low-contrast pair shows the failing ratio", () => {
    renderEdit();
    fireEvent.change(field("fgBody"), { target: { value: "#eeeeee" } });
    expect(screen.getAllByRole("alert").some((el) => el.textContent?.includes("4.5"))).toBe(true);
  });

  it("★ the malformed-hex error isolates #rrggbb inside a <bdi dir=ltr>", () => {
    renderEdit();
    fireEvent.change(field("fgHeading"), { target: { value: "#zzzzzz" } });
    const isolated = screen.getByText("#rrggbb", { selector: "bdi" });
    expect(isolated).toHaveAttribute("dir", "ltr");
  });

  it("reset requires an explicit confirmation before the submitting button appears", () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: t.actions.reset }));
    expect(screen.getByText(t.actions.resetConfirm)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("dialog").querySelector("button[type=button]:not([aria-label])") as HTMLElement);
    expect(screen.queryByText(t.actions.resetConfirm)).not.toBeInTheDocument();
  });

  it("★ REQ-UIX-013: the reset dialog names the org", () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: t.actions.reset }));
    expect(screen.getByRole("dialog")).toHaveTextContent(ORG_NAME);
  });

  it("the colour picker and the hex field stay in sync for the same token", () => {
    renderEdit();
    const input = field("fgHeading");
    const picker = (input.closest("div") as HTMLElement).querySelector('input[type="color"]') as HTMLInputElement;
    expect(picker.value).toBe(input.value);
    fireEvent.change(input, { target: { value: "#ff00ff" } });
    expect(picker.value).toBe("#ff00ff");
  });

  it("★ the poster-gradient swatch always uses the DARK palette, never the active (light) tab", () => {
    renderEdit();
    const swatch = screen.getByText(t.preview.posterGradientLabel).parentElement as HTMLElement;
    const expected = `linear-gradient(140deg, ${hexToRgb(DARK.surface)}, ${hexToRgb(DARK.canvasRaise)})`;
    expect(swatch.style.backgroundImage).toBe(expected);
    fireEvent.change(field("canvasRaise"), { target: { value: "#ff00ff" } });
    expect(swatch.style.backgroundImage).toBe(expected);
  });
});

describe("BrandKitEdit — the read-mode pattern (DEC-231 §3)", () => {
  it("names its state, counts unsaved changes, and marks a changed field in words", () => {
    renderEdit();
    expect(screen.getByRole("heading", { name: t.editMode.heading })).toBeInTheDocument();
    fireEvent.change(field("fgHeading"), { target: { value: "#ff0000" } });
    fireEvent.change(field("fgBody"), { target: { value: "#222222" } });
    expect(screen.getByText("تغييران غير محفوظين")).toBeInTheDocument();
    expect(screen.getByLabelText(`${t.colours.tokens.fgHeading} ${t.editMode.changed}`)).toBe(field("fgHeading"));
    expect(screen.getByRole("button", { name: `${t.actions.save} (2)` })).toBeInTheDocument();
  });

  it("«إلغاء» is a way back to read mode that writes nothing", () => {
    renderEdit();
    expect(screen.getByRole("link", { name: t.actions.cancel })).toHaveAttribute("href", "/app/admin/branding");
  });

  it("★★ B10: the database's refusal is shown inline with the failing pair, and nothing typed is lost", async () => {
    const saveAction = vi.fn(async (): Promise<SaveBrandKitState> => ({ error: "statusContrast", saved: false, failedPair: "live_vs_light_canvas" }));
    renderEdit(saveAction);
    fireEvent.change(field("canvas"), { target: { value: "#8a5a1f" } });
    await act(async () => {
      fireEvent.submit(field("canvas").closest("form") as HTMLFormElement);
    });
    await waitFor(() => expect(screen.getByText(t.errors.statusContrastPair.live_vs_light_canvas)).toBeInTheDocument());
    expect(screen.getByText(t.errors.statusContrastPair.live_vs_light_canvas).closest("[role=alert]")).not.toBeNull();
    expect(field("canvas").value).toBe("#8a5a1f");
    expect(replace).not.toHaveBeenCalled();
  });

  it("both schemes are submitted whichever tab is open (B15)", async () => {
    const saveAction = vi.fn(async (prev: SaveBrandKitState, _fd: FormData) => prev);
    renderEdit(saveAction);
    fireEvent.change(field("fgHeading"), { target: { value: "#ff0000" } });
    await act(async () => {
      fireEvent.submit(field("fgHeading").closest("form") as HTMLFormElement);
    });
    await waitFor(() => expect(saveAction).toHaveBeenCalled());
    const fd = saveAction.mock.calls[0][1] as FormData;
    expect(fd.get("light[fgHeading]")).toBe("#ff0000");
    expect(fd.get("dark[fgHeading]")).toBe(DARK.fgHeading);
  });

  it("★ a successful save goes back to read mode from the server's answer", async () => {
    const saveAction = vi.fn(async (): Promise<SaveBrandKitState> => ({ error: null, saved: true, updatedAt: "2026-10-05T10:00:00Z" }));
    renderEdit(saveAction);
    fireEvent.change(field("fgHeading"), { target: { value: "#ff0000" } });
    await act(async () => {
      fireEvent.submit(field("fgHeading").closest("form") as HTMLFormElement);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin/branding"));
  });
});

describe("BrandKitEdit — a save after a refusal (wave 26, the lead's e2e finding)", () => {
  it("★ refused once, then a valid palette saves and routes back to read mode", async () => {
    replace.mockClear();
    const saveAction = vi
      .fn<(prev: SaveBrandKitState, fd: FormData) => Promise<SaveBrandKitState>>()
      .mockResolvedValueOnce({ error: "statusContrast", saved: false, failedPair: "live_vs_light_canvas" })
      .mockResolvedValueOnce({ error: null, saved: true, updatedAt: "2026-10-05T10:00:00Z" });
    renderEdit(saveAction);
    fireEvent.change(field("canvas"), { target: { value: "#8a5a1f" } });
    await act(async () => {
      fireEvent.submit(field("canvas").closest("form") as HTMLFormElement);
    });
    await waitFor(() => expect(screen.getByText(t.errors.statusContrastPair.live_vs_light_canvas)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();

    fireEvent.change(field("canvas"), { target: { value: "#f4f6f9" } });
    await act(async () => {
      fireEvent.submit(field("canvas").closest("form") as HTMLFormElement);
    });
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(2));
    expect((saveAction.mock.calls[1][1] as FormData).get("light[canvas]")).toBe("#f4f6f9");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin/branding"));
  });
});
