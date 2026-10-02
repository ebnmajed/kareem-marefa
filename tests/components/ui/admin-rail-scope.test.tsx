// `ui/admin-rail` inside the playground's scope — REQ-UIX-084, REQ-UIX-085, DEC-226, DEC-227.
//
// Born inside the scope: semantic names only, no `pg:` class, in an RTL document. One level, groups divided by rules
// that render no text; the current item from the path; a badge only for a count above zero, with its accessible text.
import { render as rtlRender } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("next/navigation", async (original) => ({ ...(await original<object>()), usePathname: () => "/ar/app/admin/sessions/abc/schedule" }));

import { AdminRail } from "@/components/ui/admin-rail";
import { PlayScope } from "@/components/ui/scope";

const WithLocale = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{}}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: WithLocale });

const GROUPS = [
  [
    { key: "dashboard", href: "/app/admin", label: "لوحة التحكم", exact: true },
    { key: "proposals", href: "/app/admin/proposals", label: "المقترحات", count: 4, countLabel: "4 بانتظار القرار" },
    { key: "sessions", href: "/app/admin/sessions", label: "الجلسات", count: 0, countLabel: "لا شيء" },
  ],
  [],
  [{ key: "audit", href: "/app/admin/audit", label: "سجل التدقيق" }],
];

function mount(light = false) {
  return render(
    <PlayScope light={light}>
      <AdminRail groups={GROUPS} label="لوحة الإدارة" />
    </PlayScope>,
  ).container;
}

describe("ui/admin-rail — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only", (light) => {
    const container = mount(light);
    const nav = container.querySelector("[data-slot=admin-rail]")!;
    expect(nav.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    expect(container.innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:/);
  });

  it("is one level: a list per non-empty group, divided by a rule, with no heading text and no nested list", () => {
    const container = mount();
    const lists = container.querySelectorAll("nav > ul");
    expect(lists).toHaveLength(2);
    expect(lists[1].className).toMatch(/border-t/);
    expect(container.querySelector("ul ul")).toBeNull();
    expect(container.querySelectorAll("h2, h3, h4")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(4);
  });

  it("marks the current item from the path, locale stripped, and the dashboard only on its own path", () => {
    const container = mount();
    const current = [...container.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent);
    expect(current).toEqual(["الجلسات"]);
  });

  it("draws a badge only above zero, with the accessible text the caller pluralised", () => {
    const container = mount();
    const proposals = [...container.querySelectorAll("a")].find((a) => a.textContent?.includes("المقترحات"))!;
    expect(proposals.textContent).toContain("4 بانتظار القرار");
    expect(proposals.querySelector(".bg-signal")).not.toBeNull();
    const sessions = [...container.querySelectorAll("a")].find((a) => a.textContent?.includes("الجلسات"))!;
    expect(sessions.querySelector(".bg-signal")).toBeNull();
  });

  it("renders nothing when there is nothing to reach — a plain member's rail", () => {
    const { container } = render(<AdminRail groups={[[], []]} label="لوحة الإدارة" />);
    expect(container.innerHTML).toBe("");
  });

  it("declares no animation and no icon (REQ-UIX-053)", () => {
    const container = mount();
    expect(container.innerHTML).not.toMatch(/\b(?:animate-|transition|duration-\d)/);
    expect(container.querySelector("svg")).toBeNull();
  });
});
