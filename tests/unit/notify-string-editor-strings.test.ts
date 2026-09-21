// ★ THE STRINGS AN UNTOUCHED SPEC LOCATES BY — pinned, because a namespace
// collision moved one and nothing caught it until a build.
//
// WHAT HAPPENED. The block editor's words were written into
// `notifications.admin.emails.editor.*`, which the STRING editor owns. `save`
// became «احفظ التصميم», so `wave8-console-emails.spec.ts` timed out waiting
// for `button «احفظ القالب»` — a spec this wave promised not to touch, broken
// by a screen this wave does not replace. `tsc` was clean, `npm test` was
// green, and the only thing that could see it was an e2e run on a real build.
//
// ★ AN E2E RUN IS TOO LATE AND TOO EXPENSIVE TO BE THE GUARD. It needs a
// production build, which is the lead's, so the feedback loop for «did I move
// a word another screen stands on?» was measured in builds rather than in
// seconds. This file makes it a unit test.
//
// The values below are quoted from `wave8-console-emails.spec.ts` and
// `tests/components/admin/emails-page.test.tsx` — every string those files
// locate an element by. Changing one here is not a formatting decision; it
// means an untouched spec is about to go red, and the ledger line has to say
// why.
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/notifications.json";

const emails = ar.notifications.admin.emails;

describe("the string editor keeps every word wave 8's spec finds it by", () => {
  it("the editor's own controls", () => {
    expect(emails.editor.save).toBe("احفظ القالب");
    expect(emails.editor.saved).toBe("حُفظ القالب");
    expect(emails.editor.restore).toBe("استعد القالب الافتراضي");
    expect(emails.editor.restoreConfirm).toBe("احذف قالب المؤسسة");
    expect(emails.editor.restored).toBe("عادت الرسالة إلى القالب الافتراضي");
    expect(emails.editor.summaryTitle).toBe("لم يُحفظ القالب");
    expect(emails.editor.overridden).toBe("تصل هذه الرسالة بقالب مؤسستك.");
  });

  it("the catalogue's matrix words and the log's link", () => {
    expect(emails.catalogue.always).toBe("تصل دائمًا");
    expect(emails.catalogue.optional).toBe("يمكن للعضو إيقافها");
    expect(emails.failuresLink).toBe("اعرض الإخفاقات");
  });
});

describe("★ the two editors do not share a namespace", () => {
  it("the block editor has its own, and its save reads differently", () => {
    // The collision that caused this file: one namespace per screen, and the
    // two saves saying different things is what proves they are separate.
    expect(emails.design.save).toBe("احفظ التصميم");
    expect(emails.design.save).not.toBe(emails.editor.save);
    expect(emails.design.saved).not.toBe(emails.editor.saved);
  });

  it("no key of the block editor's has silently landed in the string editor's", () => {
    // `properties`, `alt`, `availableFields` and the rest belong to the design
    // pane. A key appearing in BOTH means someone widened `editor` again.
    const designOnly = ["properties", "selectABlock", "urlBinding", "alt", "availableFields", "blockedBySaveChecks"];
    for (const key of designOnly) {
      expect(Object.keys(emails.design), key).toContain(key);
      expect(Object.keys(emails.editor), key).not.toContain(key);
    }
  });

  it("the conversion offer belongs to the STRING editor, which is the screen that shows it", () => {
    expect(emails.editor.convertToDesign).toBe("حوّله إلى تصميم");
    expect(Object.keys(emails.design)).not.toContain("convertToDesign");
  });
});
