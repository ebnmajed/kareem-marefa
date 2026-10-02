// DEC-228 §3.4 — one attendance rate: checked in AND confirmed, over confirmed. Walk-ins beside it, never inside it.
import { describe, expect, it } from "vitest";
import { attendanceRate } from "@/components/checkin/attendance-rate";

describe("attendanceRate (REQ-CHK-012, DEC-228 §3.4)", () => {
  it("counts only checked-in members who held a confirmed reservation, over confirmed", () => {
    const r = attendanceRate(["a", "b", "c", "d"], ["a", "b", "c"]);
    expect(r).toEqual({ confirmed: 4, attended: 3, outsideConfirmed: 0, rate: 0.75 });
  });

  it("★ a walk-in is counted beside the rate, never inside it — the rate cannot pass 100 %", () => {
    const r = attendanceRate(["a", "b"], ["a", "b", "w1", "w2", "w3"]);
    expect(r.rate).toBe(1);
    expect(r.outsideConfirmed).toBe(3);
  });

  it("★ the artboard's 34 confirmed with 20 of them present and 3 walk-ins is 59 %, not 68 %", () => {
    const confirmed = Array.from({ length: 34 }, (_, i) => `m${i}`);
    const present = [...confirmed.slice(0, 20), "w1", "w2", "w3"];
    const r = attendanceRate(confirmed, present);
    expect(Math.round(r.rate! * 100)).toBe(59);
    expect(r.attended + r.outsideConfirmed).toBe(23);
  });

  it("is null, not zero, when nobody holds a confirmed reservation", () => {
    expect(attendanceRate([], ["w1"]).rate).toBeNull();
    expect(attendanceRate([], []).rate).toBeNull();
  });

  it("keys are whatever the caller makes them — across sessions, `session:member` keeps two sessions apart", () => {
    const r = attendanceRate(["s1:a", "s2:a"], ["s1:a"]);
    expect(r).toEqual({ confirmed: 2, attended: 1, outsideConfirmed: 0, rate: 0.5 });
  });

  it("a duplicate key is one member — two check-ins on two days are one attendance", () => {
    expect(attendanceRate(["a"], ["a", "a"]).attended).toBe(1);
  });
});
