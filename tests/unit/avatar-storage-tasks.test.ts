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
