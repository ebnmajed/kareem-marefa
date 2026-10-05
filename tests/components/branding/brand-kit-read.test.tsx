// SCR-059 in read mode — REQ-UIX-116, DEC-201, DEC-251 §3. Real Arabic; `next-intl/server` answers from the catalogue.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BRAND_COLOUR_TOKENS } from "@kareem/designer-runtime";
import ar from "@/messages/ar/branding.json";
import type { BrandKit } from "@/lib/brand/schema";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "branding" }),
}));

const { BrandKitRead } = await import("@/components/branding/brand-kit-read");

const SET = Object.fromEntries(BRAND_COLOUR_TOKENS.map((k, i) => [k, `#0000${String(i).padStart(2, "0")}`])) as BrandKit["light"];
const KIT: BrandKit = {
  orgId: "11111111-1111-1111-1111-111111111111",
  isOverridden: true,
  light: SET,
  dark: { ...SET, canvas: "#0b0c12", node: "#c6ff3d" },
  logo: { assetId: "22222222-2222-4222-8222-222222222222", storagePath: "x/y.png", width: 2400, height: 2400, mime: "image/png", byteSize: 1000 },
  headingFont: { id: "33333333-3333-4333-8333-333333333333", family: "Baloo Bhaijaan 2", weight: 800, style: "normal", sha256: "a".repeat(64) },
  bodyFont: null,
  updatedAt: "2026-10-05T10:00:00Z",
  updatedBy: null,
};
const TEAMS = [
  { hex: "#e9e4d6", name: "فضي" },
  { hex: "#35d0ff", name: "سماوي" },
];

async function show(kit: BrandKit = KIT) {
  const el = await BrandKitRead({ kit, logoUrl: "/signed/logo.png", teamColours: TEAMS });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {el}
    </NextIntlClientProvider>,
  );
}

const t = ar.branding;

describe("BrandKitRead", () => {
  it("★ every colour is a swatch AND its value written — ten per scheme, the accent, the team colours by name", async () => {
    const { container } = await show();
    const light = screen.getByText(t.colours.schemeLight, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(within(light).getAllByText(/^#[0-9A-F]{6}$/)).toHaveLength(BRAND_COLOUR_TOKENS.length);
    expect(within(light).getByText(t.colours.tokens.canvas)).toBeInTheDocument();
    const dark = screen.getByText(t.colours.schemeDark, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(within(dark).getAllByText(/^#[0-9A-F]{6}$/)).toHaveLength(BRAND_COLOUR_TOKENS.length);
    const accent = screen.getByText(t.colours.accent, { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(within(accent).getByText("#C6FF3D")).toBeInTheDocument();
    expect(screen.getByText("سماوي")).toBeInTheDocument();
    expect(screen.getByText("#35D0FF").tagName).toBe("BDI");
    // Never colour alone: every swatch is decorative and has a written value beside it.
    for (const s of container.querySelectorAll(".bg-team")) expect(s.getAttribute("aria-hidden")).toBe("true");
  });

  it("★ the logo: format · size · the A3 result, and the rating as a badge", async () => {
    await show();
    expect(screen.getByText((_, el) => el?.tagName === "P" && /نقطة\/بوصة/.test(el.textContent ?? ""))).toHaveTextContent("PNG · 2,400 × 2,400 · A3 عند 145 نقطة/بوصة");
    expect(screen.getByText(t.logo.rating.insufficient)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.logo.replace })).toHaveAttribute("href", "/ar/app/admin/branding?edit");
  });

  it("no logo says so, and offers an upload", async () => {
    await show({ ...KIT, logo: null });
    expect(screen.getByText(t.logo.none)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.logo.upload })).toBeInTheDocument();
  });

  it("the two fonts brand_kits holds — a chosen face, or the platform default", async () => {
    await show();
    expect(screen.getByText("Baloo Bhaijaan 2 · 800")).toBeInTheDocument();
    expect(screen.getByText(t.fonts.platformDefault)).toBeInTheDocument();
  });

  it("★ DEC-201: it says the kit feeds posters, certificates and email — not the app", async () => {
    await show();
    expect(screen.getByText(t.feeds)).toBeInTheDocument();
  });

  it("declares no motion of its own (REQ-UIX-053) — the primitives' own classes aside", async () => {
    const { container } = await show();
    for (const el of container.querySelectorAll("section, p, dl, span, div")) expect(el.className).not.toMatch(/transition|animate-|keyframe/);
  });
});
