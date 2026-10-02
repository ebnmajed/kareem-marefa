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

// ── The keyboard model (`notes/sessions.md` W21.2) — `sessions'` cases ─────────────────────────────────────────────
import { act, fireEvent, screen } from "@testing-library/react";
import { useSplitView } from "@/components/ui/split-view";

const THREE = [
  { id: "a", href: "/app/admin/proposals/a", children: "الأول" },
  { id: "b", href: "/app/admin/proposals/b", children: "الثاني" },
  { id: "c", href: "/app/admin/proposals/c", children: "الثالث" },
];

function DecideButton() {
  const { focusNext } = useSplitView();
  return (
    <button type="button" onClick={focusNext}>
      اعتمد
    </button>
  );
}

function view(items = THREE, currentId: string | null = "b", narrow: "list" | "detail" = "list") {
  return (
    <SplitView label="المقترحات" narrow={narrow} currentId={currentId} items={items} detail={<DecideButton />} back={{ href: "/app/admin/proposals", label: "المقترحات" }} />
  );
}

const row = (name: string) => screen.getByRole("link", { name });

describe("ui/split-view — the keyboard model", () => {
  it("puts exactly one row in the Tab order — the open one", () => {
    rtlRender(view(), { wrapper: WithLocale });
    const list = screen.getByRole("list", { name: "المقترحات" });
    const tabbable = [...list.querySelectorAll("a")].filter((a) => a.tabIndex === 0);
    expect(tabbable.map((a) => a.textContent)).toEqual(["الثاني"]);
  });

  it("↑ ↓ Home End move focus and never the open row; no wrapping", () => {
    rtlRender(view(), { wrapper: WithLocale });
    act(() => row("الثاني").focus());
    fireEvent.keyDown(row("الثاني"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("الثالث"));
    fireEvent.keyDown(row("الثالث"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("الثالث"));
    fireEvent.keyDown(row("الثالث"), { key: "Home" });
    expect(document.activeElement).toBe(row("الأول"));
    fireEvent.keyDown(row("الأول"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(row("الأول"));
    fireEvent.keyDown(row("الأول"), { key: "End" });
    expect(document.activeElement).toBe(row("الثالث"));
    // The open row is still the one the page opened.
    expect(row("الثاني").getAttribute("aria-current")).toBe("page");
    expect(row("الثالث").tabIndex).toBe(0);
    expect(row("الثاني").tabIndex).toBe(-1);
  });

  it("a focused row that leaves the list hands focus to the row now at its place", () => {
    const { rerender } = rtlRender(view(), { wrapper: WithLocale });
    act(() => row("الثاني").focus());
    rerender(view(THREE.filter((i) => i.id !== "b"), "b"));
    expect(document.activeElement).toBe(row("الثالث"));
  });

  it("★ focusNext() from the detail lands on the row after the open one — the next proposal is one Enter away", () => {
    rtlRender(view(), { wrapper: WithLocale });
    act(() => screen.getByRole("button", { name: "اعتمد" }).click());
    expect(document.activeElement).toBe(row("الثالث"));
  });

  it("★ and when the decided row has already left the filter, on the row that took its place", () => {
    const { rerender } = rtlRender(view(), { wrapper: WithLocale });
    rerender(view(THREE.filter((i) => i.id !== "b"), "b"));
    act(() => screen.getByRole("button", { name: "اعتمد" }).click());
    expect(document.activeElement).toBe(row("الثالث"));
  });

  it("below lg one pane shows: the list on the queue's route, the detail with its back link on an item's", () => {
    const { container, rerender } = rtlRender(view(), { wrapper: WithLocale });
    const panes = () => [...container.querySelector("[data-slot=split-view]")!.children];
    expect(panes()[1].className).toMatch(/\bhidden\b/);
    expect(panes()[0].className).not.toMatch(/\bhidden\b/);
    rerender(view(THREE, "b", "detail"));
    expect(panes()[0].className).toMatch(/\bhidden\b/);
    expect(panes()[1].className).not.toMatch(/\bhidden\b/);
    expect(screen.getAllByRole("link", { name: "المقترحات" }).some((a) => a.getAttribute("href")?.endsWith("/app/admin/proposals"))).toBe(true);
  });
});
