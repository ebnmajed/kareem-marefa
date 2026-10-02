import type { CategoryPreference, MatrixRow } from "@/lib/dal/notifications";

// «إشعارات البريد» and the category rows of SCR-029 — `DEC-219` §1, `DEC-218` §2.1, `REQ-UIX-077`, `08` §2.
//
// Pure, so the rule is tested where it is written. Both sets come from the DATABASE's matrix through
// `getPreferenceMatrix()`, which is already filtered by role — `admin_queue` only for staff, the three fixed categories
// marked unswitchable — so nothing here names a category.

/** The categories the master writes (`DEC-219` §1): every switchable one the member may hold — seven for a member,
 *  eight for staff, `proposals` among them though it is not a row of its own. */
export function masterCategories(rows: CategoryPreference[]): CategoryPreference[] {
  return rows.filter((row) => row.switchable);
}

/** The categories drawn as rows: those the master writes that hold at least one OPTIONAL email message — a switch
 *  that writes a row no send reads would be the dead toggle `08` §2 forbids (`proposals`, D3). */
export function categoryRows(rows: CategoryPreference[], matrix: MatrixRow[]): CategoryPreference[] {
  const withOptionalEmail = new Set(matrix.filter((m) => m.email && m.optional).map((m) => m.category));
  return masterCategories(rows).filter((row) => withOptionalEmail.has(row.category));
}

/**
 * ★ DERIVED, never stored (`DEC-219` §1): on only when every optional email row the member may hold is on. A missing
 * row is on — `getPreferenceMatrix()`'s `?? true`, which is `_notify_wants()`'s `coalesce(…, true)` (`0026:428-431`)
 * and the send's re-check (`0136:129`). A mixed set, including one a failed revert left, reads «off» — truthfully.
 */
export function emailMasterOn(rows: CategoryPreference[]): boolean {
  return masterCategories(rows).every((row) => row.enabled.email);
}
