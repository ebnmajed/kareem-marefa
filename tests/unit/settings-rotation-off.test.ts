// SCR-063's «لا يتغيّر» for the check-in rotation (wave 27, REQ-CHK-019, DEC-255 §3): the form posts the rotation EMPTY
// and the action reads that as null — for this one number and no other.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const saveOrgSettings = vi.fn();
vi.mock("@/lib/dal/admin-settings", async () => {
  const { z } = await import("zod");
  return {
    saveOrgSettings: (...args: unknown[]) => saveOrgSettings(...args),
    settingsFieldSchemas: new Proxy({}, { get: (_t, key) => (key === "emailReplyTo" ? z.email().nullable() : z.any()) }),
  };
});

const { saveSettings } = await import("@/app/[locale]/app/admin/settings/actions");
const { emptySettingsState } = await import("@/app/[locale]/app/admin/settings/state");

const VIEW = {
  name: "كريم معرفة",
  domains: [{ id: "d1", domain: "pp.sa" }],
  timeZone: "Asia/Riyadh",
  companyMetric: "points_per_active_member",
  companyMinActiveMembers: 3,
  checkInRotationSeconds: 600,
  checkInGraceSeconds: 120,
  maxCoPresenters: 4,
  priorityRsvpHours: 24,
  limitDocumentMb: 50,
  limitAudioMb: 200,
  limitImageMb: 20,
  limitPosterMb: 30,
  ratingMinAggregate: 3,
  emailFromName: null,
  emailReplyTo: null,
  allowJpegExport: false,
};

function form(overrides: Record<string, string> = {}, extra: [string, string][] = []): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(VIEW)) {
    if (k === "domains") continue;
    if (k === "allowJpegExport") {
      if (v) data.set(k, "on");
      continue;
    }
    data.set(k, v === null ? "" : String(v));
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === "__absent__") data.delete(k);
    else data.set(k, v);
  }
  for (const [k, v] of extra) data.append(k, v);
  data.set("opened", JSON.stringify({ view: VIEW }));
  return data;
}

describe("saveSettings — the rotation may be off", () => {
  beforeEach(() => saveOrgSettings.mockReset());

  it("an empty rotation is sent as null, guarded by the period the page opened with", async () => {
    saveOrgSettings.mockResolvedValue({ ok: true, receipt: { at: "x", wrote: ["check_in_rotation_seconds"] } });
    await saveSettings("ar", emptySettingsState, form({ checkInRotationSeconds: "" }));
    expect(saveOrgSettings).toHaveBeenCalledWith("ar", expect.objectContaining({ changes: { checkInRotationSeconds: null }, expected: { checkInRotationSeconds: 600 } }));
  });

  it("every other number is still required", async () => {
    const result = await saveSettings("ar", emptySettingsState, form({ checkInGraceSeconds: "" }));
    expect(saveOrgSettings).not.toHaveBeenCalled();
    expect(result.errors.checkInGraceSeconds).toBe("required");
  });

  it("a period outside 60–3600 is refused at the field", async () => {
    const result = await saveSettings("ar", emptySettingsState, form({ checkInRotationSeconds: "30" }));
    expect(saveOrgSettings).not.toHaveBeenCalled();
    expect(result.errors.checkInRotationSeconds).toContain("range");
  });
});
