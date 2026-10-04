// SCR-058 — REQ-NTF-007, REQ-NTF-008, REQ-NTF-014. The delivery reason read as an admin can act on it, and the
// builder's one save: its refusals, and where it says the design came from.
//
// ★ WAVE 23 (DEC-238 §4, Q2) RETIRED THE STRING EDITOR. Its cases — `saveEmailTemplate`'s trimming, its refusal at the
// body naming the field, its pre-database checks — went with it (STATUS ledger); the database's own rule 3 is still
// proven by `tests/rls/notify-bindings.test.ts`. Adoption and conversion are no longer separate actions: the builder's
// save decides the family from what the org had, and the three provenance cases below are the same three facts.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const saveTemplateChecked = vi.fn();
const getOwnTemplate = vi.fn();
vi.mock("@/lib/dal/notifications", () => ({
  saveTemplateChecked: (...a: unknown[]) => saveTemplateChecked(...a),
  getOwnTemplate: (...a: unknown[]) => getOwnTemplate(...a),
  deleteTemplate: vi.fn(),
  sendTestEmail: vi.fn(),
}));

const { deliveryReason } = await import("@/components/admin/delivery-reason");
const { saveEmailDesign } = await import("@/app/[locale]/app/admin/emails/actions");
const { emptySavedState } = await import("@/components/admin/saved-form-state");
const { DESIGN_FOR, platformDesign } = await import("@kareem/mail-runtime");

const form = (key: string, blocks: unknown, subject = "غدًا: {{title}}") => {
  const data = new FormData();
  data.set("key", key);
  data.set("subject", subject);
  data.set("blocks", typeof blocks === "string" ? blocks : JSON.stringify(blocks));
  return data;
};

describe("deliveryReason", () => {
  it("names the provider's refusals by what an admin does next", () => {
    expect(deliveryReason('resend 429: {"message":"Too many requests"}')).toBe("rateLimited");
    expect(deliveryReason('resend 422: {"message":"Invalid `to` field"}')).toBe("providerRefused");
    expect(deliveryReason("resend 503: upstream")).toBe("providerUnavailable");
    expect(deliveryReason("fetch failed")).toBe("unreachable");
    expect(deliveryReason("getaddrinfo ENOTFOUND api.resend.com")).toBe("unreachable");
    expect(deliveryReason("resend accepted the message but returned no id")).toBe("other");
    expect(deliveryReason(null)).toBeNull();
  });
});

describe("«احفظ وفعّل» — the builder's save", () => {
  beforeEach(() => {
    saveTemplateChecked.mockReset().mockResolvedValue({ ok: true });
    getOwnTemplate.mockReset().mockResolvedValue({ id: "t1", isDesign: true, sourceFamily: "reminder", updatedAt: "2026-10-03T12:00:00Z" });
  });

  it("writes the body FROM the blocks, and answers with the time the database wrote", async () => {
    const state = await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p", text: "أهلًا {{member.name}}" }] }));
    expect(state.saved).toBe(true);
    expect(state.values.updatedAt).toBe("2026-10-03T12:00:00Z");
    const [, input] = saveTemplateChecked.mock.calls[0] as [string, { body: string; requiredFields: string[] }];
    expect(input.body).toBe("أهلًا {{member.name}}");
    expect(input.requiredFields).toEqual([]);
  });

  it("a binding the database refuses comes back named; an empty design and no subject never reach it", async () => {
    saveTemplateChecked.mockResolvedValueOnce({ ok: false, error: "unknown_binding", binding: "nope" });
    const refused = await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p", text: "{{nope}}" }] }));
    expect(refused).toMatchObject({ saved: false, formError: "unknownBinding" });
    expect(refused.values.binding).toBe("nope");
    saveTemplateChecked.mockClear();
    expect((await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", { schemaVersion: 1, blocks: [] }))).formError).toBe("designEmpty");
    expect((await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", "{"))).formError).toBe("blocksUnreadable");
    expect((await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", { schemaVersion: 1, blocks: [] }, " "))).formError).toBe("subjectRequired");
    expect(saveTemplateChecked).not.toHaveBeenCalled();
  });
});

describe("★ the save records WHERE the design came from (`0125`'s source_family)", () => {
  beforeEach(() => saveTemplateChecked.mockReset().mockResolvedValue({ ok: true }));

  it("no row yet: the admin started from the platform design — every key names its family", async () => {
    getOwnTemplate.mockResolvedValue(null);
    for (const key of Object.keys(DESIGN_FOR)) {
      saveTemplateChecked.mockClear();
      await saveEmailDesign("ar", emptySavedState(), form(key, platformDesign(key)));
      const [, input] = saveTemplateChecked.mock.calls[0] as [string, { sourceFamily: string | null; blocks: unknown }];
      expect(input.sourceFamily, key).toBe(DESIGN_FOR[key]);
      expect(input.blocks, key).toBeTruthy();
    }
  });

  it("a design row keeps the family it had — a later save no longer clears it", async () => {
    getOwnTemplate.mockResolvedValue({ id: "t1", isDesign: true, sourceFamily: "rating", updatedAt: "x" });
    await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", platformDesign("MSG-reminder_1d")));
    expect((saveTemplateChecked.mock.calls[0] as [string, { sourceFamily: string }])[1].sourceFamily).toBe("rating");
  });

  it("★ a string row — the org's own words — records no family: that would be a false provenance", async () => {
    getOwnTemplate.mockResolvedValue({ id: "t1", isDesign: false, sourceFamily: null, updatedAt: "x" });
    await saveEmailDesign("ar", emptySavedState(), form("MSG-reminder_1d", { schemaVersion: 1, blocks: [{ type: "paragraph", id: "p1", text: "فقرة" }] }));
    expect((saveTemplateChecked.mock.calls[0] as [string, { sourceFamily: string | null }])[1].sourceFamily).toBeNull();
  });
});
