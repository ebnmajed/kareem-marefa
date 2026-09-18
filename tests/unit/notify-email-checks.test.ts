// The editor's checks — `16` §11.4, and the three states that mean «the mail
// you are looking at is not the mail that would be sent».
//
// The rules are pure, so they are tested here rather than through the panel:
// what the panel owes them is rendering, and what they owe an admin is never
// letting one approve something they have not seen.
import { describe, expect, it } from "vitest";
import type { EmailBlock } from "@kareem/mail-runtime";
import { bindingsUsed, blockName, hasBlocking, runChecks, SUBJECT_LIMIT } from "@/components/email/checks";

const OFFERED = ["title", "startsAt", "venue", "url", "member.name", "org"];
const base = { parsed: true, blocks: [] as EmailBlock[], dropped: [], subject: "غدًا: {{title}}", offered: OFFERED };
const ids = (checks: ReturnType<typeof runChecks>) => checks.map((c) => c.id);

describe("★ the three blocking states", () => {
  it("a parse failure is reported ALONE — nothing else is meaningful about a document that does not exist", () => {
    const checks = runChecks({ ...base, parsed: false, blocks: [{ type: "image", id: "i1", src: { kind: "org_logo" }, alt: "", width: 160 }] });
    // Not «parse failure AND a missing alt»: there is no document to have an
    // image in. Reporting both would invite fixing the second.
    expect(checks).toEqual([{ id: "parseFailed", severity: "blocking" }]);
    expect(hasBlocking(checks)).toBe(true);
  });

  it("a dropped block is named by id and type, so the panel can point at the row the mail lost", () => {
    const checks = runChecks({ ...base, dropped: [{ id: "p1", type: "paragraph", reason: "malformed" }] });
    expect(checks[0]).toEqual({ id: "droppedBlock", severity: "blocking", blockId: "p1", value: "paragraph" });
  });

  it("a dropped block with no id of its own still reports its type rather than nothing", () => {
    const checks = runChecks({ ...base, dropped: [{ id: "", type: "unknown", reason: "unknown_type" }] });
    expect(checks[0]).toMatchObject({ id: "droppedBlock", blockId: undefined, value: "unknown" });
  });

  it("★ an unknown binding is caught in the EDITOR, in the grammar the database refuses by", () => {
    const checks = runChecks({
      ...base,
      blocks: [{ type: "paragraph", id: "p1", text: "نراك في {{building}}." }],
    });
    expect(checks.some((c) => c.id === "unknownBinding" && c.value === "building")).toBe(true);
    // And an offered one is silent.
    const fine = runChecks({ ...base, blocks: [{ type: "paragraph", id: "p1", text: "نراك في {{venue}}." }] });
    expect(ids(fine)).not.toContain("unknownBinding");
  });

  it("a button's urlBinding is a NAME, not a placeholder, and is checked as one", () => {
    const checks = runChecks({
      ...base,
      blocks: [{ type: "button", id: "b1", label: "افتح", urlBinding: "deep_link", style: "primary" }],
    });
    expect(checks.some((c) => c.id === "unknownBinding" && c.value === "deep_link")).toBe(true);
  });

  it("the subject is scanned too — a binding the key does not offer is refused there as well", () => {
    const checks = runChecks({ ...base, subject: "غدًا: {{nope}}" });
    expect(checks.some((c) => c.id === "unknownBinding" && c.value === "nope")).toBe(true);
  });
});

describe("what would ship wrong rather than not ship", () => {
  it("an image with an empty alt is BLOCKING — the type admits it and the mail would carry it", () => {
    const checks = runChecks({ ...base, blocks: [{ type: "image", id: "i1", src: { kind: "org_logo" }, alt: "   ", width: 160 }] });
    expect(checks.find((c) => c.id === "imageNoAlt")).toMatchObject({ severity: "blocking", blockId: "i1" });
  });

  it("a button with no binding is BLOCKING — it renders as nothing and the admin is not told", () => {
    const checks = runChecks({ ...base, blocks: [{ type: "button", id: "b1", label: "افتح", urlBinding: "", style: "primary" }] });
    expect(checks.find((c) => c.id === "buttonNoUrl")).toMatchObject({ severity: "blocking", blockId: "b1" });
  });

  it("a long subject is ADVISORY — the mail is the mail, and a client will truncate it", () => {
    const checks = runChecks({ ...base, subject: "ا".repeat(SUBJECT_LIMIT + 1) });
    const long = checks.find((c) => c.id === "subjectTooLong");
    expect(long).toMatchObject({ severity: "advisory", value: String(SUBJECT_LIMIT + 1) });
    expect(hasBlocking(checks)).toBe(false);
  });

  it("★ the footer is reported as SATISFIED, not watched for — it is composed and cannot be missing", () => {
    const checks = runChecks(base);
    expect(checks.find((c) => c.id === "footerPresent")).toMatchObject({ severity: "satisfied" });
    expect(hasBlocking(checks)).toBe(false);
  });
});

describe("bindingsUsed — the same grammar the renderer and the trigger use", () => {
  it("reaches every text-bearing field of every block, and the subject", () => {
    const blocks: EmailBlock[] = [
      { type: "heading", id: "h1", text: "{{a}}", level: 1 },
      { type: "paragraph", id: "p1", text: "{{b}}" },
      { type: "button", id: "b1", label: "{{c}}", urlBinding: "d", style: "primary" },
      { type: "image", id: "i1", src: { kind: "org_logo" }, alt: "{{e}}", width: 160 },
      { type: "detail_list", id: "d1", items: [{ label: "{{f}}", value: "{{g}}" }] },
      { type: "divider", id: "r1" },
    ];
    expect(bindingsUsed(blocks, "{{h}}").sort()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});

describe("blockName — what ▲▼ are described by", () => {
  const label = (type: string) => ({ heading: "عنوان", paragraph: "فقرة", button: "زر", divider: "فاصل" })[type] ?? type;

  it("★ carries the block's first words, because twelve rows called «فقرة» tell a listener nothing", () => {
    expect(blockName({ type: "paragraph", id: "p1", text: "  نراك   في القاعة  " }, label)).toBe("فقرة: نراك في القاعة");
  });

  it("falls back to the type alone for a block that carries no text", () => {
    expect(blockName({ type: "divider", id: "r1" }, label)).toBe("فاصل");
    expect(blockName({ type: "heading", id: "h1", text: "   ", level: 1 }, label)).toBe("عنوان");
  });

  it("truncates rather than reading a whole paragraph aloud", () => {
    const name = blockName({ type: "paragraph", id: "p1", text: "ا".repeat(100) }, label);
    expect(name.length).toBeLessThanOrEqual("فقرة: ".length + 32);
  });
});
