// The studio frame — REQ-UIX-107, DEC-237 contract 1. The editors' routes render bare: no console bar, no rail, no
// sheet trigger — and `data-console` stays, so the console's motion-off and display-face rules still apply. Every other
// console route keeps the frame.
import { render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

let path = "/ar/app/admin/designer/doc-1";
vi.mock("next/navigation", async (original) => ({ ...(await original<object>()), usePathname: () => path }));
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { ConsoleFrame, isStudioEditor } from "@/components/shell/console-frame";

const render = (ui: React.ReactElement) =>
  rtlRender(ui, { wrapper: ({ children }) => <NextIntlClientProvider locale="ar" messages={{}}>{children}</NextIntlClientProvider> });

const props = {
  groups: [[{ key: "templates", href: "/app/admin/templates", label: "القوالب" }]],
  railLabel: "لوحة الإدارة",
  openLabel: "افتح القائمة",
  skipLabel: "تخطَّ إلى المحتوى",
  brand: <span>كريم معرفة</span>,
  title: "لوحة الإدارة",
  orgName: null,
  toApp: <span>التطبيق</span>,
  account: <span>الحساب</span>,
};

describe("ConsoleFrame — the studio frame", () => {
  it("names the editors' routes, in either locale, and nothing else", () => {
    expect(isStudioEditor("/ar/app/admin/designer/abc")).toBe(true);
    expect(isStudioEditor("/en/app/admin/designer/abc")).toBe(true);
    expect(isStudioEditor("/ar/app/admin/templates/posters")).toBe(false);
    expect(isStudioEditor("/ar/app/admin/designer")).toBe(false);
    expect(isStudioEditor("/ar/app/admin/emails/MSG-session_reminder")).toBe(true);
    expect(isStudioEditor("/ar/app/admin/emails")).toBe(false);
    expect(isStudioEditor("/ar/app/admin/sessions/abc/certificates")).toBe(false);
  });

  it("renders an editor bare — no bar, no rail, no sheet trigger — and keeps data-console", () => {
    path = "/ar/app/admin/designer/doc-1";
    const { container } = render(<ConsoleFrame {...props}><p>المصمّم</p></ConsoleFrame>);
    expect(container.querySelector("[data-console][data-studio]")).not.toBeNull();
    expect(container.querySelector("[data-console-bar]")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "افتح القائمة" })).toBeNull();
    expect(screen.getByText("المصمّم")).toBeTruthy();
  });

  it("keeps the frame on every other console route", () => {
    path = "/ar/app/admin/templates/posters";
    const { container } = render(<ConsoleFrame {...props}><p>القوالب</p></ConsoleFrame>);
    expect(container.querySelector("[data-studio]")).toBeNull();
    expect(container.querySelector("[data-console-bar]")).not.toBeNull();
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });
});
