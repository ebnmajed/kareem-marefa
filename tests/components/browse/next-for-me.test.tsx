// «التالية لك» — the game rail's card (contract 3 of wave 18, DEC-206 §4.59, DEC-207 §2).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Wrap, resolveServer, translations } from "./fixtures";
import type { NextForMeItem } from "@/lib/dal/search";

vi.mock("next-intl/server", () => ({ getTranslations: translations }));
vi.mock("@/lib/dal/search", () => ({ getNextForMe: vi.fn() }));

const { getNextForMe } = await import("@/lib/dal/search");
const { NextForMe } = await import("@/components/browse/next-for-me");

function item(over: Partial<NextForMeItem> = {}): NextForMeItem {
  return {
    id: "s1",
    title: "لوحة تحكم لا يهجرها أحد بعد أسبوع",
    href: "/app/sessions/s1",
    startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    timeZone: "Asia/Riyadh",
    phase: "open",
    hold: "seat",
    waitlistPosition: null,
    posterUrl: null,
    teamColor: "#FF9A2E",
    ...over,
  };
}

async function mount(items: NextForMeItem[]) {
  vi.mocked(getNextForMe).mockResolvedValue(items);
  const element = await resolveServer(await NextForMe({ locale: "ar" }));
  return render(<Wrap>{element}</Wrap>);
}

describe("NextForMe", () => {
  it("★ draws nothing at all when nothing is next", async () => {
    const { container } = await mount([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a named section of links to each event page, saying the seat or the waitlist place", async () => {
    await mount([
      item(),
      item({ id: "s2", href: "/app/sessions/s2", title: "ورشة الإضاءة للمبتدئين", hold: "waitlist", waitlistPosition: 3, teamColor: null }),
    ]);
    const region = screen.getByRole("region", { name: "التالية لك" });
    const links = within(region).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/ar/app/sessions/s1", "/ar/app/sessions/s2"]);
    expect(links[0]).toHaveTextContent("محجوز");
    expect(links[1]).toHaveTextContent("قائمة الانتظار 3");
  });

  it("a live session says so instead of its time", async () => {
    await mount([item({ phase: "live", startsAt: new Date().toISOString() })]);
    expect(screen.getByRole("link")).toHaveTextContent("جارية الآن");
  });

  it("the thumb is decoration, in the team colour through --team, and the title is never ellipsised", async () => {
    const { container } = await mount([item()]);
    const thumb = container.querySelector('a > span[aria-hidden="true"]') as HTMLElement;
    expect(thumb.style.getPropertyValue("--team")).toBe("#FF9A2E");
    expect(container.innerHTML).not.toMatch(/truncate|text-ellipsis|line-clamp/);
  });

  it("is accessible", async () => {
    const { container } = await mount([item(), item({ id: "s2", hold: "waitlist", waitlistPosition: null })]);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
