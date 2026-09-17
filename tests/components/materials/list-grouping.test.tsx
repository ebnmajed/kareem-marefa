// REQ-SES-018/DEC-121, contract 7 — the grouped view at `days.length > 1`. New behaviour, new
// file (rule 4) — list.test.tsx (the byte-identical proof at n <= 1) is untouched.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
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
