// The game rail's cards and the company race — as the SERVER draws them (wave 18, REQ-UIX-055,
// `HomeDesktop.dc.html`, DEC-206 §4.47 – §4.50, DEC-207 W3, W5, W7 – W11).
import { screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import type { CompanyRace } from "@/lib/dal/leaderboards";
import type { MemberWeek } from "@/lib/dal/points";
import { companyRace, memberWeek, renderIntl } from "./week-fixture";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages: scoring, namespace: namespace as never }),
}));
vi.mock("@/components/scoring/document-load", () => ({ isDocumentLoad: async () => false }));
vi.mock("@/components/scoring/week-actions", () => ({ acknowledgeWeekPoints: async () => {}, acknowledgeWeekRank: async () => {} }));
let week: MemberWeek = memberWeek();
let race: CompanyRace | null = companyRace();
vi.mock("@/lib/dal/points", () => ({ getMemberWeek: async () => week }));
vi.mock("@/lib/dal/leaderboards", () => ({ getCompanyRace: async () => race }));

const { GameRail } = await import("@/components/scoring/game-rail");
const { CompanyRaceCard } = await import("@/components/scoring/company-race-card");

async function rail(w: Partial<MemberWeek> = {}, r: CompanyRace | null = companyRace()) {
  week = memberWeek(w);
  race = r;
  // `GameRail` renders `CompanyRaceCard`, itself async: resolve it the way the server would.
  const tree = await GameRail({ locale: "ar", children: <p>التالية لك</p> });
  return renderIntl(await resolve(tree)).container;
}

// Resolves async server components nested in a tree, for jsdom.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolve(node: any): Promise<any> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  if (typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") return resolve(await node.type(node.props));
  const children = node.props.children === undefined ? undefined : await resolve(node.props.children);
  return { ...node, props: { ...node.props, children } };
}

describe("GameRail — the rank card", () => {
  it("«#4 من 212», the month's pill, and the neighbour with the gap, left to right", async () => {
    const c = await rail();
    const card = screen.getByRole("heading", { name: "ترتيبك في سبتمبر" }).closest("section")!;
    expect(within(card).getByText("ينتهي بعد 26 يومًا")).toBeInTheDocument();
    expect(c.querySelector("[data-slot=rank]")!.textContent).toContain("#4");
    expect(c.textContent).toContain("من 212");
    expect(screen.getByRole("link", { name: "سارة القحطاني" })).toHaveAttribute("href", expect.stringContaining("/app/members/00000000-0000-4000-8000-000000000001"));
    expect(c.querySelector("bdi[dir=ltr]")).not.toBeNull();
    expect(screen.getByText("تفصلك 30 نقطة عن المرتبة التي فوقك")).toHaveClass("sr-only");
  });

  it("rank 1: «أنت في الصدارة», no neighbour and no «+0»", async () => {
    const c = await rail({ rank: { rank: 1, monthPoints: 300, total: 212, above: null } });
    expect(screen.getByText("أنت في الصدارة")).toBeVisible();
    expect(c.textContent).not.toContain("+0");
  });

  it("a final snapshot says «نهائي» and no days", async () => {
    await rail({ period: { start: "2026-08-01", end: "2026-09-01", isFinal: true, takenAt: "x", daysLeft: null } });
    const card = screen.getByRole("heading", { name: "ترتيبك في أغسطس" }).closest("section")!;
    expect(within(card).getByText("نهائي")).toBeInTheDocument();
    expect(within(card).queryByText(/ينتهي/)).toBeNull();
  });

  it("no points this month: the absence in words, the month named, no «من N»", async () => {
    const c = await rail({ rank: null, rankAbsence: "no_points" });
    expect(screen.getByText("لا ترتيب بعد هذا الشهر")).toBeVisible();
    expect(c.textContent).toContain("أول نقطة في سبتمبر تُدخلك اللوحة.");
    expect(c.textContent).not.toMatch(/من \d/);
  });

  it("opted out: their own rank, and «مخفيّ عن غيرك»", async () => {
    await rail({ optedOut: true });
    expect(screen.getByText("مخفيّ عن غيرك")).toBeVisible();
  });
});

describe("GameRail — the streak and the points", () => {
  it("the streak in months, the rule read from the org, the flame, the balance — ★ and the level line (W5)", async () => {
    const c = await rail();
    expect(screen.getByRole("heading", { name: "سلسلة 7 أشهر متتالية" })).toBeInTheDocument();
    expect(screen.getByText("3 جلسات في الشهر تُبقيها")).toBeInTheDocument();
    expect(c.querySelector("[data-slot=flame] .moment-flicker svg")).not.toBeNull();
    expect(c.querySelector("[data-slot=points]")!.textContent).toContain("680");
    expect(c.querySelector<HTMLElement>("[data-slot=level-bar] [data-slot=fill]")!.style.transform).toBe(`scaleX(${680 / 700})`);
  });

  it("★ W8: no skip line, and nothing about «tonight»", async () => {
    const c = await rail();
    expect(c.textContent).not.toMatch(/تخطٍّ|الليلة تجعلها/);
  });

  it("streaks off: no flame, no title — the balance alone; none running: no flame", async () => {
    let c = await rail({ streak: null });
    expect(c.querySelector("[data-slot=flame]")).toBeNull();
    expect(c.textContent).not.toContain("سلسلة");
    c = await rail({ streak: { months: 0, requiredPerMonth: 3 } });
    expect(c.querySelector("[data-slot=flame]")).toBeNull();
    expect(screen.getByText("لا سلسلة جارية بعد")).toBeInTheDocument();
  });

  it("«التالية لك» is the slot's, after the race", async () => {
    const c = await rail();
    const texts = Array.from(c.children).map((el) => el.textContent ?? "");
    expect(texts.at(-1)).toBe("التالية لك");
  });
});

describe("CompanyRaceCard", () => {
  it("one line a company, the own outlined with «فريقك», the metric shown once and heard on every row", async () => {
    race = companyRace();
    const c = renderIntl((await CompanyRaceCard({ locale: "ar" }))!).container;
    const rows = c.querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(within(rows[2]).getByText("فريقك")).toBeVisible();
    expect(rows[2].getAttribute("class")).toContain("border-accent");
    for (const row of rows) expect(within(row).getByText("نقاط لكل عضو نشط")).toHaveClass("sr-only");
    expect(c.textContent).toContain("اللوحة الكاملة، نقاط لكل عضو نشط");
    expect(screen.getByText("ينتهي بعد 26 يومًا")).toBeInTheDocument();
    expect(c.textContent).not.toMatch(/الجولة/);
  });

  it("no company: the leaders, no outline, and the way to choose one", async () => {
    race = companyRace({ ownCompanyId: null, rows: companyRace().rows.slice(0, 2) });
    const c = renderIntl((await CompanyRaceCard({ locale: "ar" }))!).container;
    expect(c.querySelector("li.border-accent")).toBeNull();
    expect(screen.getByRole("link", { name: "اختر شركتك لتدخل السباق" })).toBeInTheDocument();
  });

  it("final: «نهائي · <month>»; no race: nothing at all", async () => {
    race = companyRace({ period: { start: "2026-08-01", end: "2026-09-01", isFinal: true, takenAt: "x", daysLeft: null } });
    renderIntl((await CompanyRaceCard({ locale: "ar" }))!);
    expect(screen.getAllByText((_, el) => el?.textContent === "نهائي · أغسطس").length).toBeGreaterThan(0);
    race = null;
    expect(await CompanyRaceCard({ locale: "ar" })).toBeNull();
  });
});
