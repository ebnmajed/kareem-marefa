// SCR-058 — REQ-NTF-007, REQ-NTF-008. The delivery reason read as an admin can
// act on it, and the template save's refusals at the field they concern.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const saveTemplateChecked = vi.fn();
vi.mock("@/lib/dal/notifications", () => ({ saveTemplateChecked: (...a: unknown[]) => saveTemplateChecked(...a), deleteTemplate: vi.fn() }));

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
