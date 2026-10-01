// `getMaterialDownloadUrl()` — the DAL's own half of «a denied member receives no URL» (REQ-MAT-005, `07` §6,
// DEC-213 §5.88, REQ-UIX-065). WHO Storage signs for is `materials_storage_read`'s (`0116:114-120`), proved
// against real Storage by `tests/e2e/wave19-content-viewer.spec.ts`; a stub cannot prove a policy. What IS this
// function's: a refused signature comes back as null with nothing to fall back to; a member's download writes no
// audit row; an admin's audit runs BEFORE the signature, and an audit that fails yields no URL at all.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls: string[] = [];
const state: { role: string; signs: boolean; auditFails: boolean; version: string | null } = { role: "member", signs: true, auditFails: false, version: "v-1" };

function stub() {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => {
          if (table === "materials") return { data: { current_version_id: state.version }, error: null };
          if (table === "material_versions") return { data: { storage_path: "org/sessions/s/materials/v-1/deck.pdf" }, error: null };
          return { data: null, error: null };
        },
      };
      return query;
    },
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`);
      return { data: null, error: state.auditFails ? { message: "denied", code: "42501" } : null };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          calls.push(`sign:${bucket}:${expiresIn}`);
          return state.signs
            ? { data: { signedUrl: `https://storage.test/object/sign/${bucket}/${path}?token=t` }, error: null }
            : { data: null, error: { message: "Object not found", statusCode: "400" } };
        },
      }),
    },
  };
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: "me", orgId: "org", role: state.role }, supabase: stub() }),
}));
vi.mock("@/lib/dal/sessions", () => ({ getSessionHeading: vi.fn(), listSessionDays: vi.fn() }));

const { getMaterialDownloadUrl } = await import("@/lib/dal/materials");
const MATERIAL = "00000000-0000-4000-8000-0000000000aa";

beforeEach(() => {
  calls.length = 0;
  Object.assign(state, { role: "member", signs: true, auditFails: false, version: "v-1" });
});

describe("getMaterialDownloadUrl", () => {
  it("★ a member Storage refuses (allow_download off) receives null — no URL, and no fallback", async () => {
    state.signs = false;
    expect(await getMaterialDownloadUrl("ar", MATERIAL)).toBeNull();
    expect(calls).toEqual(["sign:materials:300"]);
  });

  it("a member Storage signs for receives a 5-minute URL, and writes no audit row (07 §6 audits the admin path only)", async () => {
    const url = await getMaterialDownloadUrl("ar", MATERIAL);
    expect(url).toMatch(/\/object\/sign\/materials\//);
    expect(calls).toEqual(["sign:materials:300"]);
  });

  it("★ an admin's download is audited BEFORE the URL is minted", async () => {
    state.role = "admin";
    expect(await getMaterialDownloadUrl("ar", MATERIAL)).toMatch(/\/object\/sign\/materials\//);
    expect(calls).toEqual(["rpc:record_material_download", "sign:materials:300"]);
  });

  it("★ an admin whose audit fails receives no URL — an unaudited admin download never happens", async () => {
    state.role = "admin";
    state.auditFails = true;
    expect(await getMaterialDownloadUrl("ar", MATERIAL)).toBeNull();
    expect(calls).toEqual(["rpc:record_material_download"]);
  });

  it("a material with no version yet has nothing to sign", async () => {
    state.version = null;
    expect(await getMaterialDownloadUrl("ar", MATERIAL)).toBeNull();
    expect(calls).toEqual([]);
  });
});
