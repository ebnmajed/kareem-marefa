// The browser's blur check against the Server Action's schema — SCR-017,
// REQ-UIX-011, DEC-141.
//
// `checkProposalField()` is a MIRROR of `proposalInput`, kept out of the
// client bundle's zod (`components/sessions/proposal-rules.ts`). A mirror is
// only safe while it agrees, so every value below goes through both and the
// message keys must be identical — the same key the action would hand back.
import { describe, expect, it, vi } from "vitest";
import { checkProposalField, proposalErrorKey, type ProposalScalarField } from "@/components/sessions/proposal-rules";
import { zodErrors } from "@/lib/form-state";

// The schema's home is the DAL, which is `server-only`; nothing else in it runs here.
vi.mock("server-only", () => ({}));
const { proposalInput } = await import("@/lib/dal/proposals");

const VALID = {
  title: "كيف اختصرنا وقت التقارير",
  abstract: "تجربة عملية.",
  categoryId: "4f2c9b1e-7d3a-4c8e-9b2f-1a6d5e8c3b70",
  level: "introductory",
  targetAudience: null,
  expectedDurationMinutes: null,
  adminNotes: null,
};

/** What `submitProposal` builds from a raw value — the same conversions, so the comparison is fair. */
function serverKey(field: ProposalScalarField, value: string): string | null {
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  const converted =
    field === "targetAudience" || field === "adminNotes"
      ? blank(value)
      : field === "expectedDurationMinutes"
        ? value.trim() === ""
          ? null
          : Number(value.trim())
        : value;
  const raw = { ...VALID, [field]: converted };
  const parsed = proposalInput.safeParse(raw);
  if (parsed.success) return null;
  return zodErrors(parsed.error, proposalErrorKey, raw)[field] ?? null;
}

const CASES: [ProposalScalarField, string][] = [
  ["title", ""],
  ["title", "   "],
  ["title", "قص"],
  ["title", "قصة"],
  ["title", "  قصة  "],
  ["title", "ط".repeat(150)],
  ["title", "ط".repeat(151)],
  ["abstract", ""],
  ["abstract", "  "],
  ["abstract", "ن"],
  ["abstract", "ن".repeat(2000)],
  ["abstract", "ن".repeat(2001)],
  ["categoryId", ""],
  ["categoryId", "not-a-uuid"],
  ["categoryId", "11111111-2222-3333-4444-555555555555"],
  ["categoryId", "4f2c9b1e-7d3a-4c8e-9b2f-1a6d5e8c3b70"],
  ["level", "introductory"],
  ["level", "advanced"],
  ["level", "expert"],
  ["level", ""],
  ["targetAudience", ""],
  ["targetAudience", "   "],
  ["targetAudience", "ف".repeat(300)],
  ["targetAudience", "ف".repeat(301)],
  ["expectedDurationMinutes", ""],
  ["expectedDurationMinutes", "14"],
  ["expectedDurationMinutes", "15"],
  ["expectedDurationMinutes", "480"],
  ["expectedDurationMinutes", "481"],
  ["expectedDurationMinutes", "45.5"],
  ["expectedDurationMinutes", "abc"],
  ["adminNotes", ""],
  ["adminNotes", "م".repeat(2000)],
  ["adminNotes", "م".repeat(2001)],
];

describe("checkProposalField agrees with proposalInput", () => {
  it.each(CASES)("%s = %j", (field, value) => {
    expect(checkProposalField(field, value)).toBe(serverKey(field, value));
  });

  it("tells an empty title from a short one, as the action does", () => {
    expect(checkProposalField("title", "")).toBe("titleRequired");
    expect(checkProposalField("title", "   ")).toBe("titleTooShort");
  });
});
