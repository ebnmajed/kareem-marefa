// Who may be marked present by hand on SCR-044, and when — REQ-CHK-008, REQ-CHK-017, DEC-296.
//
// ★ An admin marks ANY active member of the org, at ANY time — before the day, during it, long after — on a session
// a member can have attended (published, running, completed, archived). A moderator marks a seat-holder inside the
// code family's window, as before. `mark_checked_in_manually()` (0227) re-checks all of it; this decides only what
// the screen offers.

/** The session states an admin may mark attendance on. */
export const ADMIN_MARKABLE_STATES: readonly string[] = ["published", "in_progress", "completed", "archived"];
const MODERATOR_MARKABLE_STATES: readonly string[] = ["published", "in_progress", "completed"];

export interface MarkWindowInput {
  isAdmin: boolean;
  state: string;
  /** A day is selected on the page. */
  hasDay: boolean;
  /** The selected day has begun. */
  dayStarted: boolean;
  /** The selected day's ceiling (epoch ms), or null. */
  ceiling: number | null;
  now: number;
}

/** Whether the page offers the manual mark at all, on the selected day. */
export function canMarkManually(i: MarkWindowInput): boolean {
  if (!i.hasDay) return false;
  if (i.isAdmin) return ADMIN_MARKABLE_STATES.includes(i.state);
  return i.dayStarted && MODERATOR_MARKABLE_STATES.includes(i.state) && (i.ceiling === null || i.now < i.ceiling);
}

export interface MarkOption {
  value: string;
  label: string;
}

/**
 * The sheet's members: the table's markable rows first, as the table lists them; then — for an admin — every other
 * active member of the org not already present on this day, as the members list orders them.
 */
export function manualMarkCandidates(
  listed: readonly MarkOption[],
  presentIds: ReadonlySet<string>,
  orgMembers: readonly { id: string; displayName: string | null; email: string; status: "active" | "deactivated" }[] | null,
): MarkOption[] {
  if (!orgMembers) return [...listed];
  const listedIds = new Set(listed.map((c) => c.value));
  return [
    ...listed,
    ...orgMembers
      .filter((m) => m.status === "active" && !presentIds.has(m.id) && !listedIds.has(m.id))
      .map((m) => ({ value: m.id, label: m.displayName ?? m.email })),
  ];
}
