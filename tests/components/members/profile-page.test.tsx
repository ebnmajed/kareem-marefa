// SCR-020 · /app/members/[id] — rebuilt in wave 19 (REQ-UIX-069, REQ-PRF-004, A33, DEC-213 §5.114 – §5.123,
// DEC-214). The page draws what `getMemberProfileForViewer()` hands it; the tiers are decided in the DAL and proven
// in `tests/unit/{sessions-member-profile,members-profile-standing}.test.ts`.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { C1, Wrap, id, resolveServer, translations } from "./fixtures";
import type { MemberProfileView } from "@/lib/dal/members";

vi.mock("next-intl/server", () => ({ getTranslations: translations, setRequestLocale: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ar/app/members/x",
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/lib/dal/members", () => ({ getMemberProfileForViewer: vi.fn() }));

const { getMemberProfileForViewer } = await import("@/lib/dal/members");
const { default: MemberPage } = await import("@/app/[locale]/app/members/[id]/page");

const MEMBER = id(11);
const S1 = id(201);
const S2 = id(202);

function view(over: Partial<MemberProfileView> = {}): MemberProfileView {
  const row = (n: number, state: "completed" | "published", average: number | null = null) => ({
    id: id(300 + n),
    title: `جلسة ${n}`,
    state,
    startsAt: "2026-09-14T15:00:00Z",
    endsAt: "2026-09-14T16:00:00Z",
    durationMinutes: 60,
    timeZone: "Asia/Riyadh",
    days: [],
    attendedCount: state === "completed" ? 34 : null,
    average,
  });
  return {
    tier: "member",
    profile: { id: MEMBER, displayName: "سارة القحطاني", avatarUrl: null, companyId: C1, jobTitle: "مديرة المواهب", bio: "أبني فرق المواهب من الصفر.", role: "member", createdAt: "2026-03-10T00:00:00Z" },
    companyName: "مواهب",
    interests: [{ id: id(50), name: "عروض" }],
    standing: { totalPoints: 1240, rank: 7, levelName: "كريم معرفة" },
    recognition: {
      badges: [
        { id: id(60), name: "أول حضور", description: "أول تسجيل حضور موثّق", awardedAt: "2026-04-01T00:00:00Z", retired: false, metric: "check_ins_count" },
        { id: id(61), name: "شارة قديمة", description: null, awardedAt: "2026-04-01T00:00:00Z", retired: true, metric: "manual" },
      ],
      streakMonths: 12,
    },
    presented: [],
    adminRecord: null,
    timeZone: "Asia/Riyadh",
    company: { id: C1, name: "مواهب", teamColor: "#35d0ff" },
    level: { tier: 4, name: "كريم معرفة" },
    progress: { value: 1240, max: 2000, remaining: 760, next: "سفير المعرفة" },
    monthRank: 3,
    badgeCatalogue: 14,
    presentedCount: 6,
    presentedRows: [
      { ...row(1, "published"), id: S1 },
      { ...row(2, "completed"), id: S2 },
      row(3, "completed"),
      row(4, "completed"),
      row(5, "completed"),
    ],
    photos: { count: 9, photos: [{ id: id(70), sessionId: S2, url: "https://example.test/p.webp", width: 10, height: 10, createdAt: "2026-09-14T15:00:00Z" }] },
    ...over,
  } as MemberProfileView;
}

async function mount(v: MemberProfileView | null) {
  vi.mocked(getMemberProfileForViewer).mockResolvedValue(v);
  const element = await resolveServer(await MemberPage({ params: Promise.resolve({ locale: "ar", id: MEMBER }) }));
  return render(<Wrap>{element}</Wrap>);
}

describe("SCR-020 — the profile", () => {
  it("the regions in the artboard's order: the top row, the header, the standing, the badges, the sessions, the photos", async () => {
    const { container } = await mount(view());
    const at = (el: Element | null) => (el ? [...container.querySelectorAll("*")].indexOf(el) : -1);
    const order = [
      at(screen.getByRole("navigation", { name: "مسار التنقّل" })),
      at(screen.getByRole("heading", { level: 1 })),
      at(container.querySelector("#standing")),
      at(container.querySelector("#badges")),
      at(container.querySelector("#presented")),
      at(container.querySelector("#photos")),
    ];
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("one h1, exactly the name; the breadcrumb; back and share named", async () => {
    await mount(view());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^سارة القحطاني$/);
    const crumbs = screen.getByRole("navigation", { name: "مسار التنقّل" });
    expect(within(crumbs).getByRole("link", { name: "الأعضاء" })).toHaveAttribute("href", expect.stringContaining("/app/members"));
    expect(crumbs).toHaveTextContent("مواهب");
    expect(screen.getByRole("link", { name: "رجوع إلى الأعضاء" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مشاركة الملف" })).toBeInTheDocument();
  });

  it("the header: the job title, the company chip with its dot, «عضو منذ» as month and year, the bio, the interests", async () => {
    const { container } = await mount(view());
    const header = container.querySelector("[data-slot=profile-header]")!;
    expect(header).toHaveTextContent("مديرة المواهب");
    expect(header.querySelector("[data-team-dot=team]")).not.toBeNull();
    expect(header).toHaveTextContent("عضو منذ مارس 2026");
    expect(header).toHaveTextContent("أبني فرق المواهب من الصفر.");
    expect(header).toHaveTextContent("#عروض");
  });

  it("★ the standing: the level, the balance, the line, this MONTH and all time, the streak — no week", async () => {
    const { container } = await mount(view());
    const standing = container.querySelector("section:has(#standing)")!;
    expect(standing).toHaveTextContent("كريم معرفة");
    expect(standing).toHaveTextContent("1,240");
    expect(standing).toHaveTextContent("بقي 760 نقطة لـ«سفير المعرفة»");
    expect(standing).toHaveTextContent("هذا الشهر");
    expect(standing).toHaveTextContent("#3");
    expect(standing).toHaveTextContent("كل الأوقات");
    expect(standing).toHaveTextContent("#7");
    expect(standing).toHaveTextContent("×12");
    expect(container.textContent).not.toMatch(/الأسبوع/);
  });

  it("★ opted out, seen by a colleague: «—» for the balance and both ranks, no line; the level and the streak stay", async () => {
    const { container } = await mount(view({ standing: null, monthRank: null, progress: null }));
    const standing = container.querySelector("section:has(#standing)")!;
    expect(standing).toHaveTextContent("كريم معرفة");
    expect(standing).toHaveTextContent("×12");
    expect(standing.textContent).not.toMatch(/1,240|بقي|#3|#7/);
    expect(standing.textContent!.match(/—/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it("★ «N من M» counts the held badges not retired over the org's live catalogue; a retired one is still drawn", async () => {
    const { container } = await mount(view());
    const badges = container.querySelector("section:has(#badges)")!;
    expect(badges).toHaveTextContent("1 من 14");
    expect(within(badges as HTMLElement).getAllByText("شارة قديمة").length).toBeGreaterThan(0);
  });

  it("★ the sessions: the delivered count, a noun-phrase heading, the status badge on one not yet held, and «more» in place", async () => {
    const { container } = await mount(view());
    const section = container.querySelector("section:has(#presented)")!;
    expect(section.querySelector("h2")).toHaveTextContent("الجلسات المقدَّمة");
    expect(section).toHaveTextContent("6");
    expect(within(section as HTMLElement).getAllByRole("link", { name: /جلسة 1/ })[0]).toHaveAttribute("href", expect.stringContaining(`/app/sessions/${S1}`));
    expect(section).toHaveTextContent("34 حاضرًا");
    expect(section.querySelectorAll("details").length).toBeGreaterThan(0);
    expect(section.textContent).toContain("عرض الجلسات الـ3 الأخرى");
  });

  it("★ a colleague sees no average (the DAL gave none); the member themselves does", async () => {
    await mount(view());
    expect(screen.queryByText(/متوسط التقييم/)).toBeNull();
    const rows = view().presentedRows.map((r, i) => (i === 1 ? { ...r, average: 4.8 } : r));
    await mount(view({ tier: "self", presentedRows: rows }));
    expect(screen.getAllByText("متوسط التقييم 4.8 من 5").length).toBeGreaterThan(0);
  });

  it("the photos: the count, a tile opens its session's photos, «+N» is a count and not a link", async () => {
    const { container } = await mount(view());
    const section = container.querySelector("section:has(#photos)")!;
    expect(section).toHaveTextContent("9");
    const tile = within(section as HTMLElement).getByRole("link", { name: "صورة من جلسة — افتح صور الجلسة" });
    expect(tile).toHaveAttribute("href", expect.stringContaining(`/app/sessions/${S2}#photos`));
    expect(section).toHaveTextContent("+8");
    expect(within(section as HTMLElement).getAllByRole("link")).toHaveLength(1);
  });

  it("the member tier: no self panel, no admin record", async () => {
    await mount(view());
    expect(screen.queryByText("هكذا يرى زملاؤك ملفك.")).toBeNull();
    expect(screen.queryByRole("link", { name: "عدّل ملفك" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "للمشرفين" })).toBeNull();
  });

  it("★ the self tier: the note, the two actions, and links only to pages that exist (DEC-214 §3 N7)", async () => {
    await mount(view({ tier: "self" }));
    expect(screen.getByText("هكذا يرى زملاؤك ملفك.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "عدّل ملفك" })).toHaveAttribute("href", expect.stringMatching(/\/app\/me$/));
    const links = screen.getByRole("region", { name: "في حسابك" });
    expect(within(links).getAllByRole("link").map((a) => a.getAttribute("href")?.replace(/^\/ar/, ""))).toEqual(["/app/me/points", "/app/me", "/app/me/settings"]);
  });

  it("the admin tier: «للمشرفين» with the email in an LTR isolate and the attended list", async () => {
    await mount(view({ tier: "admin", adminRecord: { email: "sara@kareem.example", attendedCount: 2, attended: [{ sessionId: S2, title: "مقدمة في الميزانية", startsAt: null }], noShowCount: 1, lateCancelCount: 0 } }));
    const record = screen.getByRole("region", { name: "للمشرفين" });
    expect(within(record).getByText("sara@kareem.example")).toHaveAttribute("dir", "ltr");
    expect(record).toHaveTextContent("مقدمة في الميزانية");
    expect(record).toHaveTextContent("جلسات الحضور");
  });

  it("a missing member is not-found", async () => {
    await expect(mount(null)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("★ no gendered verb about the member, anywhere on the page (DEC-213 §5.109)", async () => {
    const { container } = await mount(view());
    expect(container.textContent).not.toMatch(/(^|\s)(قدّم|قدّمت|قدّمها|قدّمتها|رفعتها|رفعها)($|\s)/);
  });

  it("has no accessibility violation", async () => {
    const { container } = await mount(view({ tier: "self" }));
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 30_000);
});
