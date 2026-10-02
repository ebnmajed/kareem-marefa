// SCR-041's word diff (REQ-UIX-088) — `src/components/proposals/diff.ts`.
import { describe, expect, it } from "vitest";
import { diffWords } from "@/components/proposals/diff";

const join = (parts: { kind: string; text: string }[], keep: "del" | "ins") => parts.filter((p) => p.kind !== keep).map((p) => p.text).join("");

describe("diffWords", () => {
  it("marks what was removed and what was added, word by word, in Arabic", () => {
    const parts = diffWords("التقرير يأخذ يومًا كاملًا", "التقرير يأخذ نصف يوم من شخص واحد");
    expect(parts[0]).toEqual({ kind: "same", text: "التقرير يأخذ " });
    expect(parts.filter((p) => p.kind === "del").map((p) => p.text.trim()).join(" ")).toBe("يومًا كاملًا");
    expect(parts.filter((p) => p.kind === "ins").map((p) => p.text.trim()).join(" ")).toBe("نصف يوم من شخص واحد");
  });

  it("gives back each side exactly when its opposite is left out", () => {
    const before = "قبل سنة كان التقرير يأخذ أربعة أيام.";
    const after = "قبل سنة كان التقرير يأخذ أربعة أيام من شخصين.";
    const parts = diffWords(before, after);
    expect(join(parts, "ins")).toBe(before);
    expect(join(parts, "del")).toBe(after);
  });

  it("an unchanged text is one `same` part, and an empty side is all one kind", () => {
    expect(diffWords("نص واحد", "نص واحد")).toEqual([{ kind: "same", text: "نص واحد" }]);
    expect(diffWords("", "جديد")).toEqual([{ kind: "ins", text: "جديد" }]);
    expect(diffWords("قديم", "")).toEqual([{ kind: "del", text: "قديم" }]);
  });
});
