// The inbox's date groups and its page boundary — REQ-UIX-076, REQ-NTF-006, D8 and D10 (DEC-218 §2.4), DEC-217 §3.4.
import { describe, expect, it } from "vitest";
import { groupInbox, inboxGroup } from "@/components/notifications/inbox-groups";
import { decodeInboxCursor, encodeInboxCursor } from "@/components/notifications/inbox-cursor";

const RIYADH = "Asia/Riyadh";
// Wednesday 2026-09-30, 12:00 in Riyadh. The org's week (Sat–Fri) began Saturday 2026-09-26.
const NOW = new Date("2026-09-30T09:00:00Z");

describe("inboxGroup — the day is the org's, the week is Saturday to Friday", () => {
  it("today", () => expect(inboxGroup("2026-09-30T05:00:00Z", NOW, RIYADH)).toBe("today"));
  it("★ a moment past midnight in Riyadh is today though UTC still says yesterday", () => expect(inboxGroup("2026-09-29T21:30:00Z", NOW, RIYADH)).toBe("today"));
  it("yesterday is this week (the artboard's «أمس» under «اليوم» is the drawing's slip)", () => expect(inboxGroup("2026-09-29T10:00:00Z", NOW, RIYADH)).toBe("week"));
  it("Saturday is the week's first day", () => expect(inboxGroup("2026-09-26T08:00:00Z", NOW, RIYADH)).toBe("week"));
  it("Friday before it is older", () => expect(inboxGroup("2026-09-25T08:00:00Z", NOW, RIYADH)).toBe("older"));

  it("groups a newest-first list into consecutive groups, each once", () => {
    const groups = groupInbox(
      [{ createdAt: "2026-09-30T08:00:00Z" }, { createdAt: "2026-09-30T06:00:00Z" }, { createdAt: "2026-09-28T08:00:00Z" }, { createdAt: "2026-09-01T08:00:00Z" }],
      NOW,
      RIYADH,
    );
    expect(groups.map((g) => [g.group, g.items.length])).toEqual([
      ["today", 2],
      ["week", 1],
      ["older", 1],
    ]);
  });
});

describe("the page boundary — (created_at, id), because two rows can share an instant", () => {
  // Exactly what PostgREST returns for a timestamptz: microseconds and an offset.
  const at = "2026-10-02T01:15:07.123456+00:00";

  it("round-trips a boundary as PostgREST writes it", () => {
    const cursor = { at, id: "0d5f2a5e-7c1b-4f7e-9a3d-1b2c3d4e5f60" };
    expect(decodeInboxCursor(encodeInboxCursor(cursor))).toEqual(cursor);
  });

  it("★ two rows sharing created_at have DIFFERENT boundaries — the id breaks the tie", () => {
    const a = encodeInboxCursor({ at, id: "0d5f2a5e-7c1b-4f7e-9a3d-1b2c3d4e5f60" });
    const b = encodeInboxCursor({ at, id: "0d5f2a5e-7c1b-4f7e-9a3d-1b2c3d4e5f61" });
    expect(a).not.toEqual(b);
    expect(decodeInboxCursor(a)!.at).toEqual(decodeInboxCursor(b)!.at);
  });

  it.each([null, undefined, "", "not-base64!", Buffer.from('{"at":"x","id":"y"}').toString("base64url"), Buffer.from("[]").toString("base64url")])(
    "anything it did not write reads as the first page: %j",
    (raw) => expect(decodeInboxCursor(raw)).toBeNull(),
  );
});
