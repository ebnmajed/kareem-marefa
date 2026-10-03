// Wave 23 — the checks the five new block types add (`REQ-NTF-015`,
// `REQ-NTF-012`). Wave 10's `notify-email-checks.test.ts` is evidence and is
// not edited: its exact list is `16` §11.4's, and the new ids sit beside it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EmailBlock } from "@kareem/mail-runtime";
import { BLOCK_CHECK_IDS, bindingsUsed, blockName, runChecks, type ChecksInput } from "@/components/email/checks";

const run = (blocks: EmailBlock[], offered: string[] = ["url", "title", "session_id", "member.name", "org"]) =>
  runChecks({ parsed: true, blocks, dropped: [], subject: "s", offered } satisfies ChecksInput);

describe("what would ship wrong", () => {
  it("a QR with no link is BLOCKING, and so is one with no alt", () => {
    const checks = run([{ type: "qr", id: "q", label: "x", urlBinding: "", alt: "", size: "md" }]);
    expect(checks.filter((c) => c.blockId === "q").map((c) => [c.id, c.severity])).toEqual([
      ["imageNoAlt", "blocking"],
      ["qrNoUrl", "blocking"],
    ]);
  });

  it("a poster with an empty alt is BLOCKING", () => {
    expect(run([{ type: "poster", id: "p", alt: " " }]).some((c) => c.id === "imageNoAlt" && c.blockId === "p")).toBe(true);
  });

  it("a social link we would not send is BLOCKING and names it; an empty block is advisory", () => {
    const bad = run([{ type: "social", id: "s", items: [{ label: "X", value: "http://x.example" }] }]);
    expect(bad.find((c) => c.id === "socialUrlInvalid")).toMatchObject({ severity: "blocking", blockId: "s", value: "X" });
    const empty = run([{ type: "social", id: "s", items: [{ label: "", value: "" }] }]);
    expect(empty.find((c) => c.id === "socialEmpty")?.severity).toBe("advisory");
  });

  it("a block whose data the message never carries is ADVISORY", () => {
    const checks = run([{ type: "certificate", id: "c", label: "اعرض" }]);
    expect(checks.find((c) => c.id === "blockEmptyForKey")).toMatchObject({ severity: "advisory", blockId: "c" });
    expect(run([{ type: "certificate", id: "c", label: "اعرض" }], ["serial", "url"]).some((c) => c.id === "blockEmptyForKey")).toBe(false);
  });
});

describe("bindingsUsed reaches the new fields — the ones `bindings_in_blocks()` reads", () => {
  it("a QR's label, alt and urlBinding; a social item; a certificate's label; a poster's alt", () => {
    const used = bindingsUsed(
      [
        { type: "qr", id: "q", label: "{{a}}", urlBinding: "b", alt: "{{c}}", size: "sm" },
        { type: "social", id: "s", items: [{ label: "{{d}}", value: "{{e}}" }] },
        { type: "certificate", id: "c", label: "{{f}}" },
        { type: "poster", id: "p", alt: "{{g}}" },
      ],
      "",
    );
    expect(used.sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});

describe("blockName", () => {
  it("names a new block by its words", () => {
    expect(blockName({ type: "qr", id: "q", label: "امسح للفتح", urlBinding: "url", alt: "x", size: "md" }, (t) => t)).toBe("qr: امسح للفتح");
  });
});

describe("★ every new check has strings in both locales, and every new type a name", () => {
  it.each(["ar", "en"])("%s", (locale) => {
    const emails = JSON.parse(readFileSync(new URL(`../../src/messages/${locale}/notifications.json`, import.meta.url), "utf8")).notifications.admin.emails;
    for (const id of BLOCK_CHECK_IDS) {
      expect(typeof emails.checks[id]?.title, `${locale}/${id}`).toBe("string");
      expect(typeof emails.checks[id]?.reason, `${locale}/${id}`).toBe("string");
    }
    expect(typeof emails.checks.socialUrlInvalid.titleWithValue).toBe("string");
    for (const type of ["poster", "qr", "logo", "certificate", "social"]) expect(typeof emails.blocks.type[type], `${locale}/${type}`).toBe("string");
  });
});
