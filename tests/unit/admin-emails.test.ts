// SCR-058 — REQ-NTF-007, REQ-NTF-008. The delivery reason read as an admin can
// act on it, and the template save's refusals at the field they concern.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const saveTemplateChecked = vi.fn();
vi.mock("@/lib/dal/notifications", () => ({
  saveTemplateChecked: (...a: unknown[]) => saveTemplateChecked(...a),
  deleteTemplate: vi.fn(),
  // Adoption reads the row's current subject before replacing its body.
  getTemplateSubject: async () => null,
}));

const { deliveryReason } = await import("@/components/admin/delivery-reason");
const { saveEmailTemplate } = await import("@/app/[locale]/app/admin/emails/actions");
const { emptySavedState } = await import("@/components/admin/saved-form-state");

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

describe("saveEmailTemplate", () => {
  beforeEach(() => saveTemplateChecked.mockReset());
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(values)) data.set(k, v);
    return data;
  };

  it("saves the trimmed subject and body, and the declared fields as a list", async () => {
    saveTemplateChecked.mockResolvedValue({ ok: true });
    const result = await saveEmailTemplate("ar", emptySavedState(), form({ key: "MSG-reminder_1d", subject: " جلستك غدًا ", body: "مرحبًا {{member.name}}", requiredFields: "member.name, title" }));
    expect(result.saved).toBe(true);
    expect(saveTemplateChecked).toHaveBeenCalledWith("ar", { key: "MSG-reminder_1d", subject: "جلستك غدًا", body: "مرحبًا {{member.name}}", requiredFields: ["member.name", "title"] });
  });

  it("★ the trigger's refusal lands at the body with the field it named, and what was typed comes back", async () => {
    saveTemplateChecked.mockResolvedValue({ ok: false, error: "missing_required_field", field: "title" });
    const result = await saveEmailTemplate("ar", emptySavedState(), form({ key: "MSG-reminder_1d", subject: "تذكير", body: "مرحبًا", requiredFields: "title" }));
    expect(result.errors).toEqual({ body: "missingRequiredField" });
    expect(result.values).toMatchObject({ body: "مرحبًا", subject: "تذكير", missingField: "title" });
  });

  it("empty fields and malformed field names are refused before the database; an unknown key is a form error", async () => {
    const empty = await saveEmailTemplate("ar", emptySavedState(), form({ key: "MSG-x", subject: "", body: " ", requiredFields: "عنوان" }));
    expect(empty.errors).toEqual({ subject: "subjectRequired", body: "bodyRequired", requiredFields: "requiredFieldsInvalid" });
    expect(saveTemplateChecked).not.toHaveBeenCalled();
    saveTemplateChecked.mockResolvedValue({ ok: false, error: "unknown_message_key" });
    const unknown = await saveEmailTemplate("ar", emptySavedState(), form({ key: "MSG-x", subject: "a", body: "b", requiredFields: "" }));
    expect(unknown.formError).toBe("unknownMessageKey");
  });
});


describe("★ «ابدأ من تصميم جاهز» records WHERE the design came from", () => {
  // `0125` defines `source_family` as provenance — which of DEC-082's eight
  // platform designs a row came from. Adoption is the one moment that is
  // known: afterwards the row is the org's to edit, and nothing can recover
  // the answer. It shipped writing `blocks` and `body` with the column null.
  beforeEach(() => saveTemplateChecked.mockReset());

  it("adopting MSG-reminder_1d stores source_family = 'reminder', with the blocks", async () => {
    const { adoptPlatformDesign } = await import("@/app/[locale]/app/admin/emails/actions");
    await adoptPlatformDesign("ar", "MSG-reminder_1d");
    const [, input] = saveTemplateChecked.mock.calls[0] as [string, { sourceFamily: string; blocks: unknown; key: string }];
    expect(input.key).toBe("MSG-reminder_1d");
    expect(input.sourceFamily).toBe("reminder");
    // `0125` refuses a family without blocks, so the two travel together.
    expect(input.blocks).toBeTruthy();
  });

  it("every key's adoption names the family the library maps it to", async () => {
    const { adoptPlatformDesign } = await import("@/app/[locale]/app/admin/emails/actions");
    const { DESIGN_FOR } = await import("@kareem/mail-runtime");
    for (const key of Object.keys(DESIGN_FOR)) {
      saveTemplateChecked.mockClear();
      await adoptPlatformDesign("ar", key);
      const [, input] = saveTemplateChecked.mock.calls[0] as [string, { sourceFamily: string }];
      expect(input.sourceFamily, key).toBe(DESIGN_FOR[key]);
    }
  });

  it("★ CONVERTING an org's own text records no family — that would be a false provenance", async () => {
    const { convertTemplateToDesign } = await import("@/app/[locale]/app/admin/emails/actions");
    await convertTemplateToDesign("ar", "MSG-reminder_1d", "فقرة أولى\n\nفقرة ثانية");
    const [, input] = saveTemplateChecked.mock.calls[0] as [string, { sourceFamily: string | null }];
    expect(input.sourceFamily).toBeNull();
  });
});
