// SCR-063's Server Action (REQ-UIX-102, REQ-UIX-091, DEC-232 §3, §5.1): only what changed is validated and sent, with
// the opened values as the stale guard; each refusal at its field; a save that changes nothing sends nothing and
// answers an empty receipt; the time zone must be a real one (D-N3); the last domain stays.
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

describe("saveSettings (SCR-063)", () => {
  beforeEach(() => saveOrgSettings.mockReset());

  it("an unchanged form sends nothing and answers an empty receipt — «لم يتغيّر شيء»", async () => {
    const result = await saveSettings("ar", emptySettingsState, form());
    expect(saveOrgSettings).not.toHaveBeenCalled();
    expect(result.receipt).toEqual({ at: null, wrote: [] });
  });

  it("sends ONLY the changed fields, each with the value the page opened with", async () => {
    saveOrgSettings.mockResolvedValue({ ok: true, receipt: { at: "x", wrote: ["time_zone", "allow_jpeg_export"] } });
    const result = await saveSettings("ar", emptySettingsState, form({ timeZone: "Asia/Dubai", allowJpegExport: "on" }));
    expect(saveOrgSettings).toHaveBeenCalledWith("ar", {
      changes: { timeZone: "Asia/Dubai", allowJpegExport: true },
      expected: { timeZone: "Asia/Riyadh", allowJpegExport: false },
      name: undefined,
      addDomains: [],
      removeDomains: [],
    });
    expect(result.receipt?.wrote).toEqual(["time_zone", "allow_jpeg_export"]);
  });

  it("refuses at the field: a bound read from the column, an unknown zone, a bad reply-to — and writes nothing", async () => {
    const result = await saveSettings("ar", emptySettingsState, form({ maxCoPresenters: "11", timeZone: "Mars/Olympus", emailReplyTo: "nope", limitAudioMb: "" }));
    expect(saveOrgSettings).not.toHaveBeenCalled();
    expect(result.errors).toEqual({
      maxCoPresenters: 'range|{"min":0,"max":10}',
      timeZone: "timeZone",
      emailReplyTo: "emailReplyTo",
      limitAudioMb: "required",
    });
  });

  it("the name and the domains travel in the same save; the last domain stays", async () => {
    saveOrgSettings.mockResolvedValue({ ok: true, receipt: { at: "x", wrote: ["domain.added", "org.renamed"] } });
    await saveSettings("ar", emptySettingsState, form({ name: "  اسم جديد ", addDomains: "@New.SA, other.sa" }));
    expect(saveOrgSettings.mock.calls[0][1]).toMatchObject({ name: { next: "اسم جديد", expected: "كريم معرفة" }, addDomains: ["new.sa", "other.sa"] });

    const last = await saveSettings("ar", emptySettingsState, form({}, [["removeDomain", "d1"]]));
    expect(last.errors).toEqual({ domains: "domainLast" });
    const invalid = await saveSettings("ar", emptySettingsState, form({ addDomains: "pp.sa not_a_domain" }));
    expect(invalid.errors).toEqual({ addDomains: 'domainTaken|{"domain":"pp.sa"}' });
  });

  it("a stale field is refused AT that field; any other failure is a form error", async () => {
    saveOrgSettings.mockResolvedValueOnce({ ok: false, error: "stale", fields: ["maxCoPresenters"] });
    const stale = await saveSettings("ar", emptySettingsState, form({ maxCoPresenters: "2" }));
    expect(stale.errors).toEqual({ maxCoPresenters: "stale" });
    saveOrgSettings.mockResolvedValueOnce({ ok: false, error: "failed" });
    const failed = await saveSettings("ar", emptySettingsState, form({ maxCoPresenters: "2" }));
    expect(failed).toMatchObject({ formError: "failed", receipt: null });
  });
});
