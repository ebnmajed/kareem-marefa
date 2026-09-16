import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else, so the
// field lists and the initial state live here (Next 16 refuses them at build
// time, where tsc cannot see it). Both halves of the round trip import this:
// `actions.ts` captures against it, `proposal-form.tsx` renders against it.

/**
 * Every field SCR-017 can fail on, IN THE ORDER THE PAGE RENDERS THEM.
 *
 * ★ The order is load-bearing: `<FormSummary>` lists failures in it, so the
 * first link is the first problem on the page. `coPresenters` sits where the
 * checkbox list sits — between the duration and the admin notes — even though
 * it is read with `getAll()` rather than `get()`.
 */
export const PROPOSAL_FIELDS = [
  "title",
  "abstract",
  "categoryId",
  "level",
  "targetAudience",
  "expectedDurationMinutes",
  "coPresenters",
  "adminNotes",
] as const;

export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

/** The scalars. `coPresenters` is a list and is captured separately. */
export const PROPOSAL_VALUE_FIELDS: readonly ProposalField[] = PROPOSAL_FIELDS.filter((f) => f !== "coPresenters");

// The four the schema refuses to do without are `PROPOSAL_REQUIRED` in
// `components/sessions/proposal-rules.ts`, beside the blur check that uses them.

export type ProposeState = FormState<ProposalField>;

export const emptyProposeState: ProposeState = emptyFormState<ProposalField>();
