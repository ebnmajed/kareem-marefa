// `ui/settings-group` inside the playground's scope — REQ-UIX-081, REQ-UIX-050, DEC-199 §3 – §4.
//
// Born inside the scope: semantic names only, no `pg:` class, in an RTL document (the components project's), the
// label at the inline-start and the switch at the inline-end.
import { render as rtlRender } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { SettingsGroup } from "@/components/ui/settings-group";
import { PlayScope } from "@/components/ui/scope";

// `ui/link` is next-intl's locale-aware link, which reads the locale from the provider.
const WithLocale = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{}}>
    {children}
  </NextIntlClientProvider>
);

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: WithLocale });

function mount(light = false) {
  return render(
    <PlayScope light={light}>
      <SettingsGroup
        title="الإعدادات"
        rows={[
          { kind: "switch", id: "r", label: "تذكيرات الجلسات", checked: true, action: vi.fn(), errorLabel: "تعذّر الحفظ", saveLabel: "حفظ" },
          { kind: "link", id: "c", label: "تقويم Google", value: "متصل", href: "/app/me/calendar" },
        ]}
      />
    </PlayScope>,
  ).container;
}

describe("ui/settings-group — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only", (light) => {
    const container = mount(light);
    const group = container.querySelector("[data-slot=settings-group]")!;
    expect(group.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|class="[^"]*#[0-9a-f]{3,6}/);
  });

  it("carries no class for the scope of its own: it was born inside it — the only `pg:` is the composed switch's", () => {
    const container = mount();
    const scoped = [...container.querySelectorAll("[class]")].filter((el) => /\bpg(?:-dark|-light)?:/.test(el.getAttribute("class")!));
    expect(scoped.length).toBeGreaterThan(0);
    for (const el of scoped) expect(el.closest("label")?.querySelector('[role="switch"]')).not.toBeNull();
  });

  it("the card is the scope's surface and edge; the switch's label leads and its track trails", () => {
    const container = mount();
    expect(container.querySelector("ul")!.className).toMatch(/bg-surface.*border-edge|border-edge.*bg-surface/);
    expect(container.querySelector('[data-row="switch"] form > div > div')!.className).toContain("[&>label]:flex-row-reverse");
    expect(document.documentElement.dir).toBe("rtl");
  });
});
