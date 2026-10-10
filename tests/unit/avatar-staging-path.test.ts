// Wave 29, PR B — `avatarStagingPath()`, the upload's path in the one builder (DEC-281; REQ-NFR-014, 03 §6).
// `avatar-staging/{org}/members/{member}/{upload_id}`: the same three leading segments `avatar_staging_insert` (0222)
// reads, no extension, and every segment validated before it is interpolated.
import { describe, expect, it } from "vitest";
import { avatarMemberPrefix, avatarStagingPath, InvalidStoragePathError } from "@kareem/storage-paths";

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c01";

describe("avatarStagingPath", () => {
  it("files an upload under the member's own prefix, in the staging bucket, with no extension", () => {
    expect(avatarStagingPath(ORG, MEMBER, UPLOAD)).toEqual({ bucket: "avatar-staging", path: `${ORG}/members/${MEMBER}/${UPLOAD}` });
  });

  it("shares its prefix with the member's photos, so one prefix empties both buckets", () => {
    expect(avatarStagingPath(ORG, MEMBER, UPLOAD).path.startsWith(`${avatarMemberPrefix(ORG, MEMBER)}/`)).toBe(true);
  });

  it.each([
    ["an org that is not a uuid", "../x", MEMBER, UPLOAD],
    ["a member that is not a uuid", ORG, "me", UPLOAD],
    ["an upload id with a separator", ORG, MEMBER, `${UPLOAD}/../x`],
    ["an upload id with an extension", ORG, MEMBER, `${UPLOAD}.svg`],
  ])("refuses %s", (_label, org, member, upload) => {
    expect(() => avatarStagingPath(org, member, upload)).toThrow(InvalidStoragePathError);
  });
});
