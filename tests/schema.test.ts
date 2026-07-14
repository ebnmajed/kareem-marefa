import { describe, expect, it } from "vitest";
import { registrationSchema, validateRegistration } from "@/lib/schema";

const attendee = {
  role: "attendee",
  name: "سارة العتيبي",
  email: "sara@example.com",
  locale: "ar",
};

const provider = {
  role: "provider",
  name: "Yaman Reda",
  email: "yaman@example.com",
  locale: "en",
  topicTitle: "Cutting reporting time in half",
  topicDescription: "A practical walkthrough of our reporting pipeline.",
  topicCategory: "technical",
};

describe("registrationSchema", () => {
  it("accepts an attendee happy path", () => {
    const parsed = registrationSchema.parse(attendee);
    expect(parsed).toMatchObject({ role: "attendee", email: "sara@example.com" });
  });

  it("accepts a provider happy path", () => {
    const parsed = registrationSchema.parse(provider);
    expect(parsed).toMatchObject({ role: "provider", topicCategory: "technical" });
  });

  it("normalizes email case and whitespace", () => {
    const parsed = registrationSchema.parse({
      ...attendee,
      email: "  Foo@X.COM  ",
    });
    expect(parsed.email).toBe("foo@x.com");
  });

  it("accepts an empty provider description (optional) and defaults it", () => {
    const { topicDescription: _omitted, ...rest } = provider;
    const parsed = registrationSchema.parse(rest);
    expect(parsed.role).toBe("provider");
    if (parsed.role === "provider") expect(parsed.topicDescription).toBe("");
  });

  it("rejects a provider without a title", () => {
    const { topicTitle: _omitted, ...rest } = provider;
    expect(registrationSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a provider without a category", () => {
    const { topicCategory: _omitted, ...rest } = provider;
    expect(registrationSchema.safeParse(rest).success).toBe(false);
  });

  it("strips topic fields from attendees", () => {
    const parsed = registrationSchema.parse({
      ...attendee,
      topicTitle: "should vanish",
      topicCategory: "technical",
    });
    expect("topicTitle" in parsed).toBe(false);
  });

  it("enforces length limits", () => {
    expect(
      registrationSchema.safeParse({ ...attendee, name: "x" }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        ...provider,
        topicTitle: "y".repeat(151),
      }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        ...provider,
        topicDescription: "y".repeat(601),
      }).success,
    ).toBe(false);
  });
});

describe("validateRegistration (error-key mapping)", () => {
  it("returns data for a valid provider", () => {
    const { data, errors } = validateRegistration(provider);
    expect(errors).toEqual({});
    expect(data?.role).toBe("provider");
  });

  it("maps a missing role", () => {
    const { errors } = validateRegistration({ ...attendee, role: "" });
    expect(errors.role).toBe("roleMissing");
  });

  it("maps empty vs invalid email to distinct keys", () => {
    expect(validateRegistration({ ...attendee, email: "" }).errors.email).toBe(
      "emailRequired",
    );
    expect(
      validateRegistration({ ...attendee, email: "not-an-email" }).errors.email,
    ).toBe("emailInvalid");
  });

  it("counts name length in code points (matches Postgres char_length)", () => {
    // one astral char = 2 UTF-16 units but 1 character in Postgres
    expect(validateRegistration({ ...attendee, name: "😀" }).errors.name).toBe(
      "nameRequired",
    );
  });

  it("maps an over-long provider description to its own field error", () => {
    const { errors } = validateRegistration({
      ...provider,
      topicDescription: "y".repeat(601),
    });
    expect(errors.topicDescription).toBe("descriptionTooLong");
  });

  it("only demands topic fields from providers", () => {
    const { errors } = validateRegistration({
      role: "attendee",
      name: "Test Person",
      email: "t@example.com",
    });
    expect(errors.topicTitle).toBeUndefined();
    expect(errors.topicCategory).toBeUndefined();

    const providerErrors = validateRegistration({
      role: "provider",
      name: "Test Person",
      email: "t@example.com",
    }).errors;
    expect(providerErrors.topicTitle).toBe("topicTitleRequired");
    expect(providerErrors.topicCategory).toBe("categoryRequired");
  });
});
