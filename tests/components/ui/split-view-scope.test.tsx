// `ui/split-view` inside the playground's scope — REQ-UIX-085, REQ-UIX-088. `sessions'` primitive; the lead's stub
// test (contract 2), which `sessions` extends to its plan (the keyboard model).
import { render as rtlRender } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { SplitView } from "@/components/ui/split-view";
import { PlayScope } from "@/components/ui/scope";

const WithLocale = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{}}>
    {children}
  </NextIntlClientProvider>
);

describe("ui/split-view — inside the scope", () => {
  it("renders the list and the detail inside the scope, the open row current", () => {
    const { container } = rtlRender(
      <PlayScope>
        <SplitView
          label="المقترحات"
          narrow="list"
          currentId="b"
          items={[
            { id: "a", href: "/app/admin/proposals/a", children: "الأول" },
            { id: "b", href: "/app/admin/proposals/b", children: "الثاني" },
          ]}
          detail={<p>التفاصيل</p>}
        />
      </PlayScope>,
      { wrapper: WithLocale },
    );
    expect(container.querySelector("[data-slot=split-view]")!.closest(".theme-play")).not.toBeNull();
    expect(container.querySelector('[aria-current="page"]')!.textContent).toBe("الثاني");
    expect(container.innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:|\b(?:animate-|transition|duration-\d)/);
  });
});
