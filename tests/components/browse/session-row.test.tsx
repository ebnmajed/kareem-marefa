// Browse's row card — REQ-UIX-060, REQ-UIX-026, REQ-RAT-004, DEC-123, DEC-206 §4.45 / §4.62, DEC-207 (N5).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Wrap, resolveServer, session, translations } from "./fixtures";
import type { TimelineSession } from "@/lib/dal/search";

vi.mock("next-intl/server", () => ({ getTranslations: translations }));
vi.mock("@/components/search/actions", () => ({ toggleBookmarkAction: vi.fn() }));

const { SessionRow } = await import("@/components/browse/session-row");

async function mount(over: Partial<TimelineSession> = {}, points: number | null = 20) {
  const element = await resolveServer(await SessionRow({ session: session(over), locale: "ar", points, now: new Date("2026-09-15T09:00:00Z") }));
  return render(<Wrap>{element}</Wrap>);
}

describe("SessionRow", () => {
  it("is one link to the event page, with the badge, the title, «date · place», the presenter and the seats", async () => {
    const { container } = await mount();
    const link = container.querySelector("article a")!;
    expect(link).toHaveAttribute("href", "/ar/app/sessions/00000000-0000-4000-8000-000000000001");
    expect(within(link as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent("كيف اختصرنا وقت التقارير الشهرية");
    expect(link).toHaveTextContent("التسجيل مفتوح");
    expect(link).toHaveTextContent("سعد الحربي");
    expect(link).toHaveTextContent("42 من 60 مقعدًا");
    // ★ N5: date and place on ONE line, joined with a no-break space after the dot.
    const meta = [...container.querySelectorAll("p")].find((p) => p.textContent?.includes("القاعة الكبرى"))!;
    expect(meta.textContent).toMatch(/ · القاعة الكبرى$/);
  });

  it("★ the bookmark is a separate control, and it does not open the row", async () => {
    await mount();
    const save = screen.getByRole("button", { name: "احفظ الجلسة" });
    expect(save.closest('[data-slot="actions"]')).not.toBeNull();
  });

  it("★ the amount is the rule's, on an open row — and absent when the rule is off or the row has ended", async () => {
    const { unmount } = await mount({}, 35);
    expect(screen.getByText("+35")).toBeInTheDocument();
    expect(screen.getByText("35 نقطة عند الحضور")).toHaveClass("sr-only");
    unmount();
    const off = await mount({}, null);
    expect(off.container).not.toHaveTextContent("+");
    off.unmount();
    const ended = await mount({ phase: "ended", state: "completed" }, 20);
    expect(ended.container).not.toHaveTextContent("+20");
  });

  it("says the viewer's own seat before anything about seats", async () => {
    await mount({ mine: "confirmed" });
    expect(screen.getByText("مقعدك محجوز")).toBeInTheDocument();
    expect(screen.queryByText(/من 60/)).toBeNull();
  });

  it("a full row says it is full, and how many wait", async () => {
    await mount({ seat: "full", confirmedCount: 60, waitlistCount: 4 });
    expect(screen.getByText("ممتلئة، 4 في الانتظار")).toBeInTheDocument();
  });

  it("★ a co-presented session names the lead and the others in words — never only the first, never a second avatar", async () => {
    const { container } = await mount(); // the fixture has two presenters
    const line = [...container.querySelectorAll("p")].find((p) => p.textContent?.includes("سعد الحربي"))!;
    expect(line).toHaveTextContent("سعد الحربي وآخر");
    expect(line.textContent).not.toContain("نورة القحطاني");
    expect(line.querySelectorAll("[data-slot=avatar], [aria-hidden=true] > span").length).toBeLessThanOrEqual(1);
  });

  it("a single presenter carries no «وآخر»", async () => {
    await mount({ presenters: [{ memberId: "m-1", displayName: "سعد الحربي" }] });
    expect(screen.queryByText(/وآخر/)).toBeNull();
  });

  it("three presenters: «وآخران»", async () => {
    await mount({
      presenters: [
        { memberId: "m-1", displayName: "سعد الحربي" },
        { memberId: "m-2", displayName: "نورة القحطاني" },
        { memberId: "m-3", displayName: "سلمى الحربي" },
      ],
    });
    expect(screen.getAllByText((_, el) => el?.tagName === "SPAN" && el.textContent === "سعد الحربي وآخران")).toHaveLength(1);
  });

  it("★ a multi-day row says the range and how many days, in Western digits (REQ-SES-015)", async () => {
    const day = (n: number) => ({
      id: `d${n}`,
      position: n,
      startsAt: `2026-09-2${n}T15:00:00Z`,
      endsAt: `2026-09-2${n}T17:00:00Z`,
      checkInOpen: false,
    });
    const { container } = await mount({ days: [day(1), day(2), day(3)], startsAt: "2026-09-21T15:00:00Z", endsAt: "2026-09-23T17:00:00Z" });
    const meta = [...container.querySelectorAll("p")].find((p) => p.textContent?.includes("القاعة الكبرى"))!;
    expect(meta).toHaveTextContent("3 أيام");
    expect(meta.textContent).toMatch(/21/);
    expect(meta.textContent).toMatch(/23/);
    expect(meta.textContent).not.toMatch(/[\u0660-\u0669]/);
  });

  it("the lead presenter wears the company's team ring", async () => {
    const { container } = await mount({
      presenters: [{ memberId: "m-1", displayName: "سعد الحربي", avatarUrl: null, company: { id: "c", name: "صنف", teamColor: "#FF9A2E" } }],
    });
    const ringed = [...container.querySelectorAll<HTMLElement>("[style]")].find((el) => el.style.getPropertyValue("--team") === "#FF9A2E");
    expect(ringed).toBeDefined();
  });

  it("★ no rating anywhere, and the ended wash is on the poster only (DEC-123)", async () => {
    const { container } = await mount({ phase: "ended", state: "completed" });
    expect(container.textContent).not.toMatch(/★|تقييم/);
    const badge = screen.getByText("انتهت");
    expect(badge.closest("[data-slot=media]")).toBeNull();
  });
});
