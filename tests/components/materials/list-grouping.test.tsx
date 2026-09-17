// REQ-SES-018/DEC-121, contract 7 — the grouped view at `days.length > 1`. New behaviour, new
// file (rule 4) — list.test.tsx (the byte-identical proof at n <= 1) is untouched.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/materials.json";
import sessionsAr from "@/messages/ar/sessions.json";
import type { MaterialsPageData } from "@/lib/dal/materials";
import type { SessionDay } from "@/lib/dal/sessions";

vi.mock("@/lib/dal/materials", () => ({ getMaterialsPageData: vi.fn() }));
vi.mock("@/components/materials/actions", () => ({
  saveMaterialSettings: vi.fn().mockResolvedValue({ ok: true }),
  rescopeMaterialAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace === "sessions.days"
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: "sessions.days" })
      : createTranslator({ locale: "ar", messages: ar, namespace: namespace as "materials.list" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { getMaterialsPageData } = await import("@/lib/dal/materials");
const { Materials } = await import("@/components/materials/list");

const sessionId = "11111111-1111-1111-1111-111111111111";
const uploadLimits = { documentMb: 50, audioMb: 200, imageMb: 20 };

const day1: SessionDay = { id: "d1", position: 1, startsAt: "2026-10-04T15:00:00Z", endsAt: "2026-10-04T17:00:00Z", checkInOpen: true, venue: null };
const day2: SessionDay = { id: "d2", position: 2, startsAt: "2026-10-05T15:00:00Z", endsAt: "2026-10-05T17:00:00Z", checkInOpen: true, venue: null };
const days = [day1, day2];

const sessionMaterial = {
  id: "m-session",
  kind: "pdf" as const,
  title: "الخطة الدراسية",
  phase: "after" as const,
  allowDownload: true,
  renderStatus: "ready",
  fontSubstitutionWarning: null,
  externalUrl: null,
  currentVersionId: "v1",
  createdAt: "2026-09-01T00:00:00Z",
  sessionDayId: null,
};
const day1Material = { ...sessionMaterial, id: "m-day1", title: "شرائح المقدمة", sessionDayId: "d1" };
const day2Material = { ...sessionMaterial, id: "m-day2", title: "تمرين عملي", sessionDayId: "d2" };

async function renderSlot(data: MaterialsPageData) {
  vi.mocked(getMaterialsPageData).mockResolvedValue(data);
  const element = await Materials({ sessionId, memberId: "m1", locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("Materials slot, grouped (days.length > 1)", () => {
  it("shows the session's own content first, then each day in order, each under its own <h3>", async () => {
    await renderSlot({ materials: [sessionMaterial, day1Material, day2Material], canManageAll: false, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe("للورشة كاملة");
    expect(headings.some((h) => h?.includes("الأول"))).toBe(true);
    expect(headings.some((h) => h?.includes("الثاني"))).toBe(true);
    expect(screen.getByText("الخطة الدراسية")).toBeInTheDocument();
    expect(screen.getByText("شرائح المقدمة")).toBeInTheDocument();
    expect(screen.getByText("تمرين عملي")).toBeInTheDocument();
  });

  it("a group with nothing in it is not rendered for a plain member", async () => {
    // Only day1 has content; day2 and the session group are both empty.
    await renderSlot({ materials: [day1Material], canManageAll: false, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toHaveLength(1);
    expect(headings[0]).toContain("الأول");
  });

  it("a manager sees every group's own header, including an empty one, with «أضف مادة» in each", async () => {
    await renderSlot({ materials: [day1Material], canManageAll: true, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(3); // session + day1 + day2, all shown for a manager
    expect(screen.getAllByText("أضف مادة")).toHaveLength(3);
  });

  it("a plain member sees no scope chip; a manager sees one per item, opening a menu of every day", async () => {
    await renderSlot({ materials: [day1Material], canManageAll: false, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    expect(screen.queryByText("▾")).not.toBeInTheDocument();

    await renderSlot({ materials: [day1Material], canManageAll: true, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const trigger = screen.getByText("▾").closest("summary")!;
    expect(trigger).toBeInTheDocument();
    // The menu offers the session and both days.
    const details = trigger.closest("details")!;
    expect(details.querySelectorAll("button")).toHaveLength(3);
  });

  it("is accessible with two populated groups and the manager's chip and add controls all showing", async () => {
    const { container } = await renderSlot({
      materials: [sessionMaterial, day1Material],
      canManageAll: true,
      presenterOfSession: false,
      uploadLimits,
      days,
      timeZone: "Asia/Riyadh",
    });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

// ★ REQ-MAT-006 as amended (DEC-121): the phase badge reads relative to the item's own scope,
// never the session — the lead's finding against a real build (a day-scoped material's chip
// still said «بعد الجلسة» while the workshop had days left to run).
describe("REQ-MAT-006 — the phase badge is relative to the item's own scope", () => {
  it("a day-scoped «بعد» material reads «بعد اليوم», never «بعد الجلسة»", async () => {
    await renderSlot({ materials: [day1Material], canManageAll: false, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    expect(screen.getByText("بعد اليوم")).toBeInTheDocument();
    expect(screen.queryByText("بعد الجلسة")).not.toBeInTheDocument();
  });

  it("a session-scoped «بعد» material reads «بعد الجلسة», exactly as before REQ-SES-018", async () => {
    await renderSlot({ materials: [sessionMaterial], canManageAll: false, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    expect(screen.getByText("بعد الجلسة")).toBeInTheDocument();
    expect(screen.queryByText("بعد اليوم")).not.toBeInTheDocument();
  });
});

// ★ The lead's finding against the real build: mounting every group's own upload form OPEN made a
// three-day presenter page 9,000 CSS px tall (four forms all on screen at once); a ten-day
// workshop (allowed) would be worse. `GroupDisclosure` (native <details>/<summary>, no client
// state machine) keeps each group's form closed until its own header control opens it.
describe("REQ-SES-018/DEC-121 — a group's own form sits behind its header control, closed by default", () => {
  it("no group's form is open when the grouped view first renders", async () => {
    await renderSlot({ materials: [day1Material], canManageAll: true, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const triggers = screen.getAllByText("أضف مادة"); // session + day1 + day2, one per group
    expect(triggers).toHaveLength(3);
    for (const trigger of triggers) {
      expect(trigger.closest("details")!.open).toBe(false);
    }
  });

  it("the header control opens exactly its own group's form and leaves the others closed", async () => {
    await renderSlot({ materials: [day1Material], canManageAll: true, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const triggers = screen.getAllByText("أضف مادة");
    // Groups render session first, then days in order — the second trigger is day 1's own.
    const day1Trigger = triggers[1];
    fireEvent.click(day1Trigger);

    const opened = day1Trigger.closest("details")!;
    expect(opened.open).toBe(true);
    for (const trigger of triggers) {
      if (trigger === day1Trigger) continue;
      expect(trigger.closest("details")!.open).toBe(false);
    }
  });

  it("opening moves focus to the form's first field", async () => {
    await renderSlot({ materials: [day1Material], canManageAll: true, presenterOfSession: false, uploadLimits, days, timeZone: "Asia/Riyadh" });
    const trigger = screen.getAllByText("أضف مادة")[0];
    fireEvent.click(trigger);
    // ★ jsdom toggles `<details>.open` correctly on a real click (proven by the two tests
    // above) but does not reliably dispatch the accompanying native `toggle` event a real
    // browser fires per spec — a documented jsdom gap, not a bug here. Dispatched by hand so
    // this test exercises GroupDisclosure's own listener logic directly, which is the part
    // this track owns; the click→open step above already proves the native part.
    fireEvent(trigger.closest("details")!, new Event("toggle"));
    // GroupDisclosure's own `toggle` listener focuses the first field inside the revealed
    // content — UploadForm's own first control is the material-kind select.
    expect(document.activeElement).toHaveAccessibleName("نوع المادة");
  });
});
