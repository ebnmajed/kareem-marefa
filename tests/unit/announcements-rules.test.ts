// REQ-ADM-025 (DEC-267) — an announcement's derived status, the org's wall clock, and its member settings row.
import { describe, expect, it } from "vitest";
import { announcementStatus, atZone, excerpt, sameMinute, toLocalInput } from "@/components/announcements/rules";
import { categoryRows } from "@/components/settings/email-master";
import type { CategoryPreference, MatrixRow } from "@/lib/dal/notifications";
import ar from "@/messages/ar/notifications.json";
import en from "@/messages/en/notifications.json";

const NOW = new Date("2026-10-06T12:00:00Z");

describe("the status is derived as 0164's read policy draws it", () => {
  it("scheduled before its time, live inside its window, ended at its end", () => {
    expect(announcementStatus({ publishedAt: "2026-10-07T00:00:00Z", expiresAt: null }, NOW)).toBe("scheduled");
    expect(announcementStatus({ publishedAt: "2026-10-06T12:00:00Z", expiresAt: null }, NOW)).toBe("live");
    expect(announcementStatus({ publishedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-06T12:00:01Z" }, NOW)).toBe("live");
    // `expires_at > now()` — at the instant itself it has left the feed.
    expect(announcementStatus({ publishedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-06T12:00:00Z" }, NOW)).toBe("ended");
  });
});

describe("the org's wall clock", () => {
  it("round-trips a picker value through an instant, in Western digits", () => {
    const iso = atZone("2026-10-07T18:30", "Asia/Riyadh")!;
    expect(iso).toBe("2026-10-07T15:30:00.000Z");
    expect(toLocalInput(iso, "Asia/Riyadh")).toBe("2026-10-07T18:30");
    expect(atZone("not a time", "Asia/Riyadh")).toBeNull();
  });

  it("an untouched time is the same minute — the picker carries no seconds", () => {
    expect(sameMinute("2026-10-07T15:30:42.123Z", "2026-10-07T15:30:00.000Z")).toBe(true);
    expect(sameMinute("2026-10-07T15:31:00Z", "2026-10-07T15:30:59Z")).toBe(false);
  });

  it("an excerpt never cuts a word when a space is near", () => {
    expect(excerpt("قصير")).toBe("قصير");
    const long = excerpt("هذا إعلان طويل جدًا يتحدث عن افتتاح قاعة الابتكار الجديدة في الطابق الثالث");
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(41);
  });
});

describe("«الإعلانات» on the member's settings", () => {
  it("is a switchable row, because its one message is an optional email", () => {
    const row: CategoryPreference = { category: "announcements", switchable: true, available: { inApp: true, email: true }, enabled: { inApp: true, email: true }, alwaysOn: [] };
    const matrix: MatrixRow[] = [{ key: "MSG-announcement_published", category: "announcements", inApp: true, email: true, optional: true }];
    expect(categoryRows([row], matrix).map((r) => r.category)).toEqual(["announcements"]);
  });

  it("has its name and its inbox title in both catalogues", () => {
    expect(ar.notifications.category.announcements.name).toBe("الإعلانات");
    expect(en.notifications.category.announcements.name).toBe("Announcements");
    expect(ar.notifications.message["MSG-announcement_published"]).toBe("إعلان جديد");
  });
});
