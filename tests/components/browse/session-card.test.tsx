// One session on the timeline — `16` §6.4, REQ-UIX-003, DEC-123.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Wrap, session, translations } from "./fixtures";
import type { TimelineSession } from "@/lib/dal/search";

vi.mock("next-intl/server", () => ({ getTranslations: translations }));
vi.mock("@/components/search/actions", () => ({ toggleBookmarkAction: vi.fn() }));

const { SessionCard } = await import("@/components/browse/session-card");

async function mount(s: TimelineSession, pinned = false) {
  const element = await SessionCard({ session: s, locale: "ar", pinned });
  return render(<Wrap>{element}</Wrap>);
}

describe("SessionCard", () => {
  it("is one link to the event page, with the state, the title, who, when and where", async () => {
    const { container } = await mount(session());
    expect(screen.getByRole("link", { name: /كيف اختصرنا وقت التقارير الشهرية/ })).toHaveAttribute("href", "/ar/app/sessions/00000000-0000-4000-8000-000000000001");
    expect(screen.getByText("التسجيل مفتوح")).toBeInTheDocument();
    expect(screen.getByText("سعد الحربي")).toBeInTheDocument();
    expect(screen.getByText(/وآخر/)).toBeInTheDocument();
    expect(screen.getByText(/القاعة الكبرى/)).toBeInTheDocument();
    // 60 − 42 = 18, and the six-form plural reads «مقعدًا» for it.
    expect(screen.getByText("يتبقى 18 مقعدًا")).toBeInTheDocument();
    // The bookmark is its own control, named, nested in the card.
    expect(screen.getByRole("button", { name: "احفظ الجلسة" })).toHaveAttribute("aria-pressed", "false");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false }, "nested-interactive": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("★ carries no rating, anywhere (REQ-RAT-004, DEC-114 class 2)", async () => {
    const { container } = await mount(session());
    expect(container.textContent).not.toMatch(/تقييم|★/);
  });

  it("★ the ended wash is on the image only — the status badge is never inside the dimmed element (DEC-123)", async () => {
    const { container } = await mount(session({ phase: "ended", state: "completed", attended: true }));
    const badge = screen.getByText("انتهت");
    const media = container.querySelector('[data-slot="media"]')!;
    expect(media).not.toContainElement(badge);
    expect(screen.getByText("حضرت")).toBeInTheDocument();
  });

  it("says the viewer's own seat before anything else about seats", async () => {
    await mount(session({ mine: "confirmed" }));
    expect(screen.getByText("مقعدك محجوز")).toBeInTheDocument();
    expect(screen.queryByText(/يتبقى/)).toBeNull();
  });

  it("the pinned card says what it is", async () => {
    await mount(session({ mine: "confirmed" }), true);
    expect(screen.getByText("التالية لك")).toBeInTheDocument();
  });
});
