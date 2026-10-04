// The builder's subject, shown in the canvas's tokens and stored in the template syntax — wave 23's carry,
// REQ-UIX-112, REQ-NTF-012. «غدًا: {{title}}» is shown as «غدًا: {عنوان الجلسة}» and saved back as the very string it
// was, so the mail a member receives cannot move (`tests/unit/mail-pinned/` holds the subjects too).
import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES } from "@kareem/mail-runtime";
import ar from "@/messages/ar/notifications.json";
import { labelKey, toDisplay, toStored, tokenMap } from "@/components/email/binding-labels";
import { runChecks } from "@/components/email/checks";

const labels = ar.notifications.admin.emails.builder.bindings as Record<string, string>;
const label = (binding: string) => labels[labelKey(binding)] ?? binding;
const bindingsIn = (text: string) => [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!);

describe("★ every message's subject survives the round trip exactly", () => {
  it.each(Object.entries(DEFAULT_TEMPLATES))("%s", (_key, template) => {
    const tokens = tokenMap([...bindingsIn(template.subject), "member.name", "org"], label);
    const shown = toDisplay(template.subject, tokens);
    // Shown in Arabic words, never the syntax — when the subject binds anything at all.
    if (bindingsIn(template.subject).length > 0) expect(shown).not.toContain("{{");
    expect(toStored(shown, tokens)).toBe(template.subject);
  });

  it("shows «غدًا: {عنوان الجلسة}» for the 1-day reminder", () => {
    const tokens = tokenMap(["title"], label);
    expect(toDisplay("غدًا: {{title}}", tokens)).toBe("غدًا: {عنوان الجلسة}");
  });
});

describe("an unknown binding is still refused at the field", () => {
  it("a typed {{building}} is kept as written and the checks name it — the save waits, as before", () => {
    const tokens = tokenMap(["title", "member.name"], label);
    const stored = toStored("غدًا: {{building}}", tokens);
    expect(stored).toBe("غدًا: {{building}}");
    const checks = runChecks({ parsed: true, blocks: [], dropped: [], subject: stored, offered: ["title", "member.name"] });
    expect(checks.find((c) => c.id === "unknownBinding")).toMatchObject({ severity: "blocking", value: "building" });
  });

  it("a brace pair the message does not offer as a token stays literal text, never a binding", () => {
    const tokens = tokenMap(["title"], label);
    expect(toStored("غدًا: {المكان}", tokens)).toBe("غدًا: {المكان}");
  });
});
