// REQ-PRF-011 and REQ-NFR-014 for avatars (DEC-182): the export carries OUR
// copy and never Google's URL; the nightly assertion asks, for `avatars`, whether
// the member a path names belongs to the org it is filed under.
import { describe, expect, it, vi } from "vitest";
import { avatarOwnerViolations } from "../../worker/src/tasks/assert_storage_prefixes";
import { exportAvatar } from "../../worker/src/tasks/build_data_export";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const MEMBER = "22222222-2222-4222-8222-222222222222";

function helpersReturning(rows: unknown[]) {
  return { query: vi.fn(async () => ({ rows })), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } } as never;
}

describe("exportAvatar — the archive's picture", () => {
  it("is our 192 px copy, inline, read from the current version's path", async () => {
    const download = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const got = await exportAvatar(
      helpersReturning([{ target: { org_id: ORG_A, answer: "accepted", source_url: "https://lh3.googleusercontent.com/a/x", version: 1790000000000, anonymised: false } }]),
      MEMBER,
      download,
    );
    expect(download).toHaveBeenCalledWith("avatars", `${ORG_A}/members/${MEMBER}/1790000000000/192.webp`);
    expect(got).toEqual({ content_type: "image/webp", size: 192, data_base64: "AQID" });
    // ★ The source URL is read by the door, and never carried into the archive.
    expect(JSON.stringify(got)).not.toContain("googleusercontent");
  });

  it("★ wave 29: an UPLOAD is exported whatever the Google answer — the version alone says a picture exists", async () => {
    const download = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const got = await exportAvatar(
      helpersReturning([{ target: { org_id: ORG_A, answer: "declined", source_url: null, version: 1790000000500, anonymised: false, source: "upload" } }]),
      MEMBER,
      download,
    );
    expect(download).toHaveBeenCalledWith("avatars", `${ORG_A}/members/${MEMBER}/1790000000500/192.webp`);
    expect(got).toEqual({ content_type: "image/webp", size: 192, data_base64: "AQID" });
  });

  it.each([
    ["no copy", { answer: "accepted", version: null, anonymised: false }],
    ["declined", { answer: "declined", version: null, anonymised: false }],
    ["anonymised", { answer: null, version: null, anonymised: true }],
  ])("is nothing when %s", async (_label, t) => {
    const download = vi.fn();
    expect(await exportAvatar(helpersReturning([{ target: { org_id: ORG_A, source_url: null, ...t } }]), MEMBER, download)).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });
});

describe("avatarOwnerViolations — wave 29: the staging bucket asks the same question", () => {
  const staged = `${ORG_A}/members/${MEMBER}/6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c01`;

  it("a staged upload under its own org is clean; under another org's prefix it is a violation, named by its bucket", async () => {
    expect(await avatarOwnerViolations(helpersReturning([{ member_id: MEMBER, org_id: ORG_A }]), [staged], "avatar-staging")).toEqual([]);
    expect(await avatarOwnerViolations(helpersReturning([{ member_id: MEMBER, org_id: ORG_B }]), [staged], "avatar-staging")).toEqual([
      { bucket: "avatar-staging", path: staged, reason: "member belongs to another org" },
    ]);
  });
});

describe("avatarOwnerViolations — a face under the wrong org is a leak", () => {
  const good = `${ORG_A}/members/${MEMBER}/1790000000000/96.webp`;

  it("a member of the prefix's own org is clean", async () => {
    expect(await avatarOwnerViolations(helpersReturning([{ member_id: MEMBER, org_id: ORG_A }]), [good])).toEqual([]);
  });

  it("a member of ANOTHER org, filed under this org's prefix, is a violation", async () => {
    const got = await avatarOwnerViolations(helpersReturning([{ member_id: MEMBER, org_id: ORG_B }]), [good]);
    expect(got).toEqual([{ bucket: "avatars", path: good, reason: "member belongs to another org" }]);
  });

  it("an unknown member, or a path that is not a member avatar's, is a violation", async () => {
    const odd = `${ORG_A}/sessions/${MEMBER}/1.webp`;
    const got = await avatarOwnerViolations(helpersReturning([]), [good, odd]);
    expect(got.map((v) => v.reason).sort()).toEqual(["member segment is not a known member", "not a member avatar path"]);
  });
});
