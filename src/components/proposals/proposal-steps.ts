import type { StepperStep } from "@/components/ui";
import type { ProposalState } from "@/lib/dal/proposals";

// SCR-018's line — where a proposal stands (`Proposal.dc.html`, DEC-213 §5.98, DEC-214 D3, D15). One pure function,
// so the mapping is tested once and every caller draws the same line.
//
// ★ «طُلب تعديل» IS A STEP ONLY WHILE IT IS THE STATE (DEC-214 D3). Changes may be requested or not, and after a
// decision the database cannot say which (`decision_reason` is cleared on approval; the history is staff-only), so
// outside `changes_requested` the line has four steps and never claims a step it cannot know was passed.
// ★ «مُجدوَل» IS DERIVED (§5.98): a session naming the proposal that is on the schedule — published or later (D15).
// A draft session is not scheduled, and a cancelled one leaves «معتمد» current.
// ★ A draft (before step 1) and a rejected proposal (no place on the line) have NO line: the page shows their
// status badge instead, so this returns null.

export type ProposalStepId = "submitted" | "in_review" | "changes_requested" | "approved" | "scheduled";

export interface ProposalLine {
  steps: { id: ProposalStepId; status: StepperStep["status"] }[];
  /** `signal` while the member is needed (changes requested), else `accent`. */
  tone: "signal" | "accent";
}

const FOUR: ProposalStepId[] = ["submitted", "in_review", "approved", "scheduled"];
const FIVE: ProposalStepId[] = ["submitted", "in_review", "changes_requested", "approved", "scheduled"];

function line(ids: ProposalStepId[], current: ProposalStepId, tone: ProposalLine["tone"]): ProposalLine {
  const at = ids.indexOf(current);
  return { steps: ids.map((id, i) => ({ id, status: i < at ? "done" : i === at ? "current" : "upcoming" })), tone };
}

export function proposalLine(state: ProposalState, scheduled: boolean): ProposalLine | null {
  switch (state) {
    case "draft":
    case "rejected":
      return null;
    case "submitted":
      return line(FOUR, "submitted", "accent");
    case "in_review":
      return line(FOUR, "in_review", "accent");
    case "changes_requested":
      return line(FIVE, "changes_requested", "signal");
    case "approved":
      return line(FOUR, scheduled ? "scheduled" : "approved", "accent");
  }
}
