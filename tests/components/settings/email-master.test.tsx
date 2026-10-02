// «إشعارات البريد»'s derived state and SCR-029's rows — DEC-219 §1, DEC-218 §2.1, REQ-UIX-077, `08` §2.
//
// The inputs are `getPreferenceMatrix()`'s rows as the DAL returns them: already filtered by role (`admin_queue` only
// for staff) and with a missing stored row read as on — `_notify_wants()`'s `coalesce(…, true)` (`0026:428-431`),
// which the send re-checks through (`0136:129`). So staff and member differ by input, never by a flag here.
import { describe, expect, it } from "vitest";
import type { CategoryPreference, MatrixRow, NotificationCategory } from "@/lib/dal/notifications";
import { categoryRows, emailMasterOn, masterCategories } from "@/components/settings/email-master";

const OPTIONAL: NotificationCategory[] = ["new_sessions", "my_sessions", "reminders", "ratings", "social", "recognition", "proposals"];
const FIXED: NotificationCategory[] = ["certificates", "moderation", "account"];

const row = (category: NotificationCategory, email = true): CategoryPreference => ({
  category,
  switchable: !FIXED.includes(category),
  available: { inApp: true, email: true },
  enabled: { inApp: true, email },
  alwaysOn: [],
});

/** A member's rows: the seven optional and the three fixed. A staff member's add `admin_queue`. */
const member = (off: NotificationCategory[] = []) => [...OPTIONAL, ...FIXED].map((c) => row(c, !off.includes(c)));
const staff = (off: NotificationCategory[] = []) => [...member(off), row("admin_queue", !off.includes("admin_queue"))];

/** `0156`'s matrix, reduced to what matters here: which categories hold an optional email message. */
const MATRIX: MatrixRow[] = [
  { key: "MSG-session_published", category: "new_sessions", inApp: true, email: true, optional: true },
  { key: "MSG-materials_added", category: "my_sessions", inApp: true, email: true, optional: true },
  { key: "MSG-session_cancelled", category: "my_sessions", inApp: true, email: true, optional: false },
  { key: "MSG-reminder_1d", category: "reminders", inApp: true, email: true, optional: true },
  { key: "MSG-rating_prompt", category: "ratings", inApp: true, email: true, optional: true },
  { key: "MSG-mentioned", category: "social", inApp: true, email: true, optional: true },
  { key: "MSG-badge_earned", category: "recognition", inApp: true, email: true, optional: true },
  { key: "MSG-copresenter_declined", category: "proposals", inApp: true, email: false, optional: true },
  { key: "MSG-proposal_approved", category: "proposals", inApp: true, email: true, optional: false },
  { key: "MSG-proposal_submitted", category: "admin_queue", inApp: true, email: true, optional: true },
  { key: "MSG-certificate_issued", category: "certificates", inApp: true, email: true, optional: false },
];

describe("emailMasterOn — derived, never stored (DEC-219 §1)", () => {
  it("all on → on", () => expect(emailMasterOn(member())).toBe(true));
  it("no stored rows at all reads as all on — absence means on, as the send reads it", () => expect(emailMasterOn(member())).toBe(true));
  it.each(OPTIONAL.filter((c) => c !== "proposals"))("one category off (%s) → off", (category) => expect(emailMasterOn(member([category]))).toBe(false));
  it("`proposals` off — not a row of its own, written by the master — still → off", () => expect(emailMasterOn(member(["proposals"]))).toBe(false));
  it("staff: admin_queue off → off; all on → on", () => {
    expect(emailMasterOn(staff(["admin_queue"]))).toBe(false);
    expect(emailMasterOn(staff())).toBe(true);
  });
  it("a member's matrix has no admin_queue row, so a stale stored one cannot turn it off", () => expect(emailMasterOn(member())).toBe(true));
  it("the three fixed categories are never read — they are not switchable", () => {
    const rows = member().map((r) => (FIXED.includes(r.category) ? { ...r, enabled: { inApp: true, email: false } } : r));
    expect(emailMasterOn(rows)).toBe(true);
  });
});

describe("what the master writes and what is drawn as a row", () => {
  it("the master writes the seven optional categories for a member — proposals included — and eight for staff", () => {
    expect(masterCategories(member()).map((r) => r.category)).toEqual(OPTIONAL);
    expect(masterCategories(staff()).map((r) => r.category)).toEqual([...OPTIONAL, "admin_queue"]);
  });
  it("never certificates, moderation or account", () => {
    const written = masterCategories(staff()).map((r) => r.category);
    for (const fixed of FIXED) expect(written).not.toContain(fixed);
  });
  it("a row is drawn only for a category with an optional EMAIL message — proposals is not a row (D3)", () => {
    expect(categoryRows(member(), MATRIX).map((r) => r.category)).toEqual(["new_sessions", "my_sessions", "reminders", "ratings", "social", "recognition"]);
    expect(categoryRows(staff(), MATRIX).map((r) => r.category)).toContain("admin_queue");
  });
});
