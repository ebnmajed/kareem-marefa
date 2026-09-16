// The proposal form's field rules, for the BROWSER — SCR-017, REQ-UIX-009,
// REQ-UIX-011, `16` §8.2 item 5.
//
// ★ WHY A MIRROR AND NOT THE SCHEMA ITSELF. The authority is `proposalInput`
// in `lib/dal/proposals.ts`, which the Server Action parses before anything
// else and which mirrors the table's own checks (`0010`). Importing it here
// would put zod in the propose form's client bundle — no client component in
// the product ships zod today, and `lib/form-state.ts` goes out of its way not
// to. So the blur check is a mirror, and the mirror is pinned:
// `tests/unit/sessions-proposal-rules.test.ts` runs the same values through
// both and fails on any disagreement. The server still decides; this only
// says it sooner.
//
// ★ AND THE MESSAGE KEYS ARE ONE FUNCTION. `proposalErrorKey()` is what the
// action maps a Zod issue through and what the blur check returns, so a field
// can never be «قصير جدًا» on blur and «مطلوب» on submit.

export type ProposalScalarField = "title" | "abstract" | "categoryId" | "level" | "targetAudience" | "expectedDurationMinutes" | "adminNotes";

/** The table's bounds (`0010`), which `proposalInput` repeats. */
export const PROPOSAL_LIMITS = {
  titleMin: 3,
  titleMax: 150,
  abstractMax: 2000,
  audienceMax: 300,
  durationMin: 15,
  durationMax: 480,
  notesMax: 2000,
} as const;

/** The four `proposalInput` cannot do without — marked «مطلوب» (REQ-UIX-011). */
export const PROPOSAL_REQUIRED: readonly ProposalScalarField[] = ["title", "abstract", "categoryId", "level"];

/**
 * The message key for a failed field.
 *
 * A member reading «العنوان قصير جدًا» when they left the box empty is being
 * told the wrong thing, so "missing" and "too short" are different keys even
 * though Zod raises one code for both.
 */
export function proposalErrorKey(field: string, code: string, empty: boolean): string {
  switch (field) {
    case "title":
      return empty ? "titleRequired" : code === "too_big" ? "titleTooLong" : "titleTooShort";
    case "abstract":
      return code === "too_big" ? "abstractTooLong" : "abstractRequired";
    case "categoryId":
      return "categoryRequired";
    case "level":
      return "levelRequired";
    case "targetAudience":
      return "audienceTooLong";
    case "expectedDurationMinutes":
      return "durationInvalid";
    case "adminNotes":
      return "notesTooLong";
    case "coPresenters":
      return "coPresentersTooMany";
    default:
      return "failed";
  }
}

// `z.uuid()`'s own pattern (zod v4 `core/regexes`), so a category id the
// schema would refuse is refused here too — not a looser "looks like a uuid".
const UUID = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
const LEVELS = new Set(["introductory", "intermediate", "advanced"]);

/**
 * What the Server Action would say about this one value — a message key, or
 * `null` when it passes. Called on blur, after the first submit only.
 *
 * `value` is the control's raw value, untrimmed, exactly what `formStateFrom()`
 * captures; the trims below are the schema's, not the form's.
 */
export function checkProposalField(field: ProposalScalarField, value: string): string | null {
  const trimmed = value.trim();
  const fail = (code: string) => proposalErrorKey(field, code, value === "");
  switch (field) {
    case "title":
      if (trimmed.length < PROPOSAL_LIMITS.titleMin) return fail("too_small");
      if (trimmed.length > PROPOSAL_LIMITS.titleMax) return fail("too_big");
      return null;
    case "abstract":
      if (trimmed.length < 1) return fail("too_small");
      if (trimmed.length > PROPOSAL_LIMITS.abstractMax) return fail("too_big");
      return null;
    case "categoryId":
      return UUID.test(value) ? null : fail("invalid_format");
    case "level":
      return LEVELS.has(value) ? null : fail("invalid_value");
    case "targetAudience":
      return trimmed.length > PROPOSAL_LIMITS.audienceMax ? fail("too_big") : null;
    case "adminNotes":
      return trimmed.length > PROPOSAL_LIMITS.notesMax ? fail("too_big") : null;
    case "expectedDurationMinutes": {
      if (trimmed === "") return null;
      const n = Number(trimmed);
      return Number.isInteger(n) && n >= PROPOSAL_LIMITS.durationMin && n <= PROPOSAL_LIMITS.durationMax ? null : fail("invalid_type");
    }
  }
}
