// The three namespaces this track owns, checked for the two things that go
// wrong quietly in an Arabic-first catalogue.
//
// 1. **All six ICU plural forms in `ar`.** Arabic selects `zero`, `one`, `two`,
//    `few`, `many` and `other`, and a message missing `two` renders the
//    `other` branch for exactly two items — a sentence that reads wrong only
//    on the count nobody tests by hand (CLAUDE.md § i18n and RTL).
// 2. **`#` never appears in a plural.** ICU's `#` formats with the LOCALE's
//    numbering system, which for `ar` is Arabic-Indic. Numerals follow the ORG
//    setting, not the locale (REQ-INT-006, 10 §4), so every plural here
//    selects on `count` and prints a pre-formatted `{value}`.
//
// Plus key parity between `ar` and `en`, since a missing English key silently
// falls back to Arabic and nobody notices until an English reader does.

import { describe, expect, it } from "vitest";
import arLegal from "@/messages/ar/legal.json";
import arPlatform from "@/messages/ar/platform.json";
import arPrivacy from "@/messages/ar/privacy.json";
import enLegal from "@/messages/en/legal.json";
import enPlatform from "@/messages/en/platform.json";
import enPrivacy from "@/messages/en/privacy.json";
import { NAMESPACES } from "@/messages";

const ARABIC_PLURAL_FORMS = ["zero", "one", "two", "few", "many", "other"] as const;

type Tree = Record<string, unknown>;

function leaves(tree: Tree, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") out.push(...leaves(value as Tree, path));
    else out.push([path, String(value)]);
  }
  return out;
}

const PAIRS: [string, Tree, Tree][] = [
  ["platform", arPlatform as Tree, enPlatform as Tree],
  ["legal", arLegal as Tree, enLegal as Tree],
  ["privacy", arPrivacy as Tree, enPrivacy as Tree],
];

describe("platform, legal and privacy messages", () => {
  it("every namespace is registered in the catalogue", () => {
    for (const [name] of PAIRS) expect(NAMESPACES).toContain(name);
  });

  it.each(PAIRS)("%s: ar and en carry the same keys", (_name, ar, en) => {
    const arKeys = leaves(ar).map(([k]) => k).sort();
    const enKeys = leaves(en).map(([k]) => k).sort();
    expect(enKeys).toEqual(arKeys);
  });

  it.each(PAIRS)("%s: every Arabic plural has all six ICU forms", (name, ar) => {
    const plurals = leaves(ar).filter(([, value]) => value.includes(", plural,"));
    // Not vacuous, where it should not be: `platform` counts orgs, domains,
    // versions, sessions and queue ages. `legal` and `privacy` are prose and
    // count nothing, which is a fact about them rather than an omission.
    if (name === "platform") expect(plurals.length).toBeGreaterThan(0);
    for (const [key, value] of plurals) {
      for (const form of ARABIC_PLURAL_FORMS) {
        expect(value, `${name}.${key} is missing the "${form}" form`).toContain(`${form} {`);
      }
    }
  });

  it.each(PAIRS)("%s: no plural uses ICU's # — numerals follow the org, not the locale", (name, ar, en) => {
    for (const [locale, tree] of [
      ["ar", ar],
      ["en", en],
    ] as const) {
      for (const [key, value] of leaves(tree as Tree)) {
        if (!value.includes(", plural,")) continue;
        expect(value, `${locale}/${name}.${key} uses # instead of a pre-formatted {value}`).not.toContain("#");
      }
    }
  });

  it("every interpolated value in a platform message is bidi-isolated where it is Latin", () => {
    // The two messages that interpolate a Latin identifier into an Arabic
    // sentence carry `<bdi>` in the STRING, because wrapping at the call site
    // cannot reorder text the formatter has already joined.
    const byKey = Object.fromEntries(leaves(arPlatform as Tree));
    expect(byKey["platform.orgs.deleteConfirmLabel"]).toContain("<bdi>{slug}</bdi>");
    expect(byKey["platform.templates.version"]).toContain("<bdi>{value}</bdi>");
  });

  it("the privacy policy states the hosting region as a fact to revisit, not a conclusion", () => {
    // OQ-026 / 12 §6.1: the page must NOT conclude compliance in either
    // direction. This is the one sentence that keeps it honest, and a later
    // edit that drops it should break a test rather than a requirement.
    const ar = Object.fromEntries(leaves(arLegal as Tree));
    const en = Object.fromEntries(leaves(enLegal as Tree));
    expect(ar["legal.privacy.transferBody"]).toContain("ap-southeast-1");
    expect(ar["legal.privacy.transferHonest"]).toContain("لم تخلص");
    expect(en["legal.privacy.transferHonest"]).toContain("does not conclude");
  });

  it("the privacy screen says no to self-service deletion, and says why", () => {
    // 12 §5.4 / REQ-PRF-007: the refusal and its reason are one message, so a
    // later edit cannot keep the "no" and drop the explanation.
    const ar = Object.fromEntries(leaves(arPrivacy as Tree));
    expect(ar["privacy.page.deactivateHonest"]).toContain("عضو سابق");
    expect(ar["privacy.page.deactivateHonest"].length).toBeGreaterThan(120);
  });
});
