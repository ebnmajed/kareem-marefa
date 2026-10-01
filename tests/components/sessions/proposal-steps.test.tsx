// SCR-018's line — `proposalLine()` (DEC-213 §5.98, DEC-214 D3, D15). One mapping, every state.
import { describe, expect, it } from "vitest";
import { proposalLine } from "@/components/proposals/proposal-steps";

const at = (state: Parameters<typeof proposalLine>[0], scheduled = false) => {
  const line = proposalLine(state, scheduled);
  return line && { ids: line.steps.map((s) => s.id), current: line.steps.find((s) => s.status === "current")?.id, done: line.steps.filter((s) => s.status === "done").map((s) => s.id), tone: line.tone };
};

describe("proposalLine", () => {
  it("a draft and a rejected proposal have no line — the page shows their badge (D3)", () => {
    expect(at("draft")).toBeNull();
    expect(at("rejected")).toBeNull();
  });

  it("★ «طُلب تعديل» is a step only while it is the state — five steps, the third current, in the signal", () => {
    expect(at("changes_requested")).toEqual({
      ids: ["submitted", "in_review", "changes_requested", "approved", "scheduled"],
      current: "changes_requested",
      done: ["submitted", "in_review"],
      tone: "signal",
    });
  });

  it("★ elsewhere the line has four steps, so no passed step is ever claimed", () => {
    for (const state of ["submitted", "in_review", "approved"] as const) {
      expect(at(state)!.ids).toEqual(["submitted", "in_review", "approved", "scheduled"]);
      expect(at(state)!.tone).toBe("accent");
    }
    expect(at("submitted")).toMatchObject({ current: "submitted", done: [] });
    expect(at("in_review")).toMatchObject({ current: "in_review", done: ["submitted"] });
    expect(at("approved")).toMatchObject({ current: "approved", done: ["submitted", "in_review"] });
  });

  it("★ «مُجدوَل» is derived: an approved proposal whose session is on the schedule (D15)", () => {
    expect(at("approved", true)).toMatchObject({ current: "scheduled", done: ["submitted", "in_review", "approved"] });
  });

  it("exactly one current in every line", () => {
    for (const state of ["submitted", "in_review", "changes_requested", "approved"] as const) {
      for (const scheduled of [false, true]) expect(proposalLine(state, scheduled)!.steps.filter((s) => s.status === "current")).toHaveLength(1);
    }
  });
});
