// SCR-064's «CSV» in the hub's header (REQ-SUR-007, REQ-ADM-017, DEC-232).
//
// ★ A plain download anchor: `next/link` would prefetch an audited bulk read on hover. Its visible word is the
// artboard's «CSV», and its name says what it downloads — with «CSV» inside it (label in name, SC 2.5.3).
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import survey from "@/messages/ar/survey.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => createTranslator({ locale: "ar", messages: survey, namespace: namespace as "survey.session" }),
}));

let offers = true;
vi.mock("@/lib/dal/surveys", () => ({ offersSurveyExport: async () => offers }));

const { SurveyHeaderAction } = await import("@/components/survey/survey-header-action");

beforeEach(() => {
  offers = true;
});

describe("SurveyHeaderAction", () => {
  it("is a plain download link to the audited route, named by what it downloads", async () => {
    render((await SurveyHeaderAction({ locale: "ar", sessionId: "s1" }))!);
    const link = screen.getByRole("link", { name: /CSV/ });
    expect(link.getAttribute("href")).toBe("/api/admin/exports/survey/s1");
    expect(link.hasAttribute("download")).toBe(true);
    expect(link.textContent).toBe("CSV");
    expect(link.getAttribute("aria-label")).toContain("الاستبانة");
  });

  it("renders nothing when the DAL says no — a moderator, or no survey", async () => {
    offers = false;
    expect(await SurveyHeaderAction({ locale: "ar", sessionId: "s1" })).toBeNull();
  });
});
