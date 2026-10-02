// ★ THE attendance rate — one definition, everywhere (DEC-228 §3.4, REQ-CHK-012, REQ-ADM-004).
//
// The members who checked in AND held a confirmed reservation, over the confirmed reservations. A walk-in — anyone
// checked in without a confirmed reservation — never promised to come, so they are counted BESIDE the rate and never
// inside it: a rate that counts them passes 100 % (the dashboard did, `console` F2) and says nothing about whether
// the people who reserved turned up. The artboard's 68 % = 23/34 is not this rule and is not adopted.
//
// Pure, so the attendance report (`getAttendanceReport()`, one session, keyed by member) and the dashboard
// (`admin-dashboard.ts`, many sessions, keyed by `session:member`) compute the same number from the same keys — and a
// test computes both from one fixture. «Checked in» is an ACTIVE check-in (`removed_at is null`, REQ-CHK-017): the
// caller passes only those. On a multi-day session it is an active check-in on ANY day (`has_checked_in()`).

export interface AttendanceRate {
  /** Confirmed reservations — the denominator. */
  confirmed: number;
  /** Of those, how many have an active check-in — the numerator. */
  attended: number;
  /** Active check-ins with no confirmed reservation behind them — counted beside the rate, never inside it. */
  outsideConfirmed: number;
  /** `attended / confirmed`, between 0 and 1; null when nobody holds a confirmed reservation. */
  rate: number | null;
}

/**
 * @param confirmed the keys holding a confirmed reservation (`memberId`, or `sessionId:memberId` across sessions)
 * @param checkedIn the keys with an ACTIVE check-in, in the same key space
 */
export function attendanceRate(confirmed: Iterable<string>, checkedIn: Iterable<string>): AttendanceRate {
  const held = new Set(confirmed);
  const present = new Set(checkedIn);
  let attended = 0;
  let outsideConfirmed = 0;
  for (const key of present) {
    if (held.has(key)) attended += 1;
    else outsideConfirmed += 1;
  }
  return { confirmed: held.size, attended, outsideConfirmed, rate: held.size > 0 ? attended / held.size : null };
}
