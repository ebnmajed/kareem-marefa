// `members.json` — SCR-019, SCR-020 (wave 19): Arabic first and complete, English beside it, six forms wherever a
// count appears (`10` §5), Western digits only (DEC-124), and ★ no gendered verb about another member (DEC-213 §5.109):
// nothing stores gender, so a verb about a third person would have to guess. A noun phrase does not.
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/members.json";
import en from "@/messages/en/members.json";

type Tree = { [key: string]: string | Tree };
function flat(tree: Tree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => (typeof value === "string" ? [[`${prefix}${key}`, value]] : Object.entries(flat(value, `${prefix}${key}.`)))),
  );
}

const AR = flat(ar as unknown as Tree);
const EN = flat(en as unknown as Tree);

describe("members.json", () => {
  it("the two catalogues have the same keys", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(AR).sort());
  });

  it.each(Object.entries(AR).filter(([, v]) => /plural/.test(v)))("%s carries all six Arabic forms", (_key, value) => {
    for (const form of ["zero", "one", "two", "few", "many", "other"]) expect(value).toContain(`${form} {`);
  });

  it("no Eastern Arabic digit anywhere (DEC-124)", () => {
    expect(Object.values(AR).join(" ")).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("★ no third-person verb about a member — the forms the artboards drew and the tree had (DEC-213 §5.109)", () => {
    const text = Object.values(AR).join(" ");
    // A word on its own, so «التقدّم» (progress, a noun) is not read as «قدّم».
    for (const verb of ["قدّم", "قدّمت", "قدّمها", "قدّمتها", "حضرها", "حضرتها", "رفعها", "رفعتها", "نال", "نالت", "أكمل", "أكملت"]) {
      expect(text, verb).not.toMatch(new RegExp(`(^|[\\s«({])${verb}($|[\\s».،)}])`));
    }
  });
});
