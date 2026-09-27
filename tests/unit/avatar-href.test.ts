// Contract 4 (DEC-180, DEC-182) — the one URL shape an avatar has, and the one
// storage shape behind it. REQ-PRF-008, REQ-PRF-009, REQ-NFR-014.
import { describe, expect, it } from "vitest";
import { avatarHref } from "@/components/privacy/avatar-href";
import { avatarMemberPrefix, avatarPath } from "../../packages/storage-paths/src/avatar";

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

describe("avatarHref", () => {
  it("is a same-origin path to our route, versioned, 96 px by default", () => {
    expect(avatarHref({ id: MEMBER, avatarVersion: 1790000000123 })).toBe(`/api/avatars/${MEMBER}?v=1790000000123&s=96`);
    expect(avatarHref({ id: MEMBER, avatarVersion: "1790000000123" }, 192)).toBe(`/api/avatars/${MEMBER}?v=1790000000123&s=192`);
  });

  it("is null whenever there is no copy — so <Avatar> draws the initials (REQ-PRF-009)", () => {
    expect(avatarHref({ id: MEMBER, avatarVersion: null })).toBeNull();
    expect(avatarHref({ id: MEMBER, avatarVersion: undefined })).toBeNull();
  });

  it("never builds a URL from a malformed id or version", () => {
    expect(avatarHref({ id: "../etc", avatarVersion: 1 })).toBeNull();
    expect(avatarHref({ id: MEMBER, avatarVersion: "1&s=9" })).toBeNull();
    expect(avatarHref({ id: MEMBER, avatarVersion: 0 })).toBeNull();
  });

  it("★ never names a host — nothing it returns can point at Google (DEC-099)", () => {
    expect(avatarHref({ id: MEMBER, avatarVersion: 5 })).toMatch(/^\/api\/avatars\//);
  });
});

describe("avatarPath — org first, member, version, size", () => {
  it("builds the path avatars_storage_read reads segment by segment", () => {
    expect(avatarPath(ORG, MEMBER, 1790000000123, 96)).toEqual({ bucket: "avatars", path: `${ORG}/members/${MEMBER}/1790000000123/96.webp` });
    expect(avatarPath(ORG, MEMBER, "7", 192).path).toBe(`${ORG}/members/${MEMBER}/7/192.webp`);
    expect(avatarMemberPrefix(ORG, MEMBER)).toBe(`${ORG}/members/${MEMBER}`);
  });

  it.each([
    ["a non-uuid org", () => avatarPath("org", MEMBER, 1, 96)],
    ["a non-uuid member", () => avatarPath(ORG, "../x", 1, 96)],
    ["a version with a separator", () => avatarPath(ORG, MEMBER, "1/2", 96)],
    ["a zero version", () => avatarPath(ORG, MEMBER, 0, 96)],
    ["a size we do not make", () => avatarPath(ORG, MEMBER, 1, 64 as 96)],
  ])("refuses %s", (_label, build) => {
    expect(build).toThrow(/storage path/);
  });
});
