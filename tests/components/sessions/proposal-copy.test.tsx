// The Arabic contract of STORY-PRO-001: the three labels REQ-PRO-002 pins to
// the pre-launch registration form, the six ICU plural forms Arabic needs,
// and the logical-property rule for every file this track owns.
//
// These are cheap tests guarding expensive mistakes. A changed label breaks
// the promise that a member reading «عنوان الموضوع المقترح» on the live site
// meets the same words in the product; a missing plural form ships «3 دقيقة»;
// a physical margin looks right in Arabic and inverts the day English lands.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), "utf8"));
const ar = read("src/messages/ar/proposals.json").proposals;
const en = read("src/messages/en/proposals.json").proposals;
const marketing = read("src/messages/ar/marketing.json");
const arAdmin = read("src/messages/ar/admin.json").admin;
const arSessions = read("src/messages/ar/sessions.json").sessions;
const enSessions = read("src/messages/en/sessions.json").sessions;
const enAdmin = read("src/messages/en/admin.json").admin;

describe("REQ-PRO-002 — the labels members have already read", () => {
  it("العنوان and التصنيف are word for word the pre-launch form's", () => {
    expect(ar.propose.form.titleLabel).toBe(marketing.register.topicTitleLabel);
    expect(ar.propose.form.categoryLabel).toBe(marketing.register.categoryLabel);
  });

  it("النبذة keeps the pre-launch label and drops only its parenthetical", () => {
    // The live form said «نبذة عن موضوعك (جملة أو جملتان)» because that field
    // capped at 600 characters and the copy promised the details would come
    // later. `proposals.abstract` runs to 2000 and IS the text an admin
    // reviews, so keeping "a sentence or two" would be a false instruction.
    // The label — which is what REQ-PRO-002 binds — is unchanged.
    expect(marketing.register.descriptionLabel).toBe(`${ar.propose.form.abstractLabel} (جملة أو جملتان)`);
  });

  it("carries the live site's own argument above the form", () => {
    expect(ar.propose.lead).toContain("لست بحاجة لأن تكون خبيرًا");
  });

  it("says out loud that there is no date to choose (REQ-PRO-001)", () => {
    expect(ar.propose.noScheduleNote).toMatch(/موعد|مكان/);
  });
});

describe("REQ-INT-002 / REQ-INT-006 — the catalogue", () => {
  const SIX = ["zero", "one", "two", "few", "many", "other"];

  function flatten(o: unknown, prefix = "", out: Record<string, string> = {}) {
    if (typeof o === "string") out[prefix] = o;
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  const arFlat = { ...flatten(ar), ...flatten(arAdmin, "admin"), ...flatten(arSessions, "sessions") };
  const enFlat = { ...flatten(en), ...flatten(enAdmin, "admin"), ...flatten(enSessions, "sessions") };

  it("every Arabic plural message carries all six ICU forms", () => {
    const plurals = Object.entries(arFlat).filter(([, v]) => v.includes(", plural,"));
    expect(plurals.length).toBeGreaterThan(0);
    for (const [key, value] of plurals) {
      for (const form of SIX) {
        expect(value, `${key} is missing the \`${form}\` form`).toMatch(new RegExp(`(^|[\\s{])${form}\\s*\\{`));
      }
    }
  });

  it("the duration message pairs the plural form with a pre-formatted numeral", () => {
    // `#` would render in the locale's default numbering system (arab for ar),
    // which can disagree with org_settings.numerals. The count still drives
    // the plural branch; the digits come from formatNumber().
    for (const key of ["propose.duration", "admin.proposals.age", "admin.proposals.count", "admin.sessions.readyCount", "sessions.event.seats", "admin.venues.upcoming", "admin.venues.seats"]) {
      expect(arFlat[key], key).toContain("{value}");
      expect(arFlat[key], key).not.toContain("#");
    }
  });

  it("the English twin has the same keys", () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(arFlat).sort());
  });

  it("every TEXT value interpolated into a message is wrapped for bidi isolation", () => {
    // REQ-INT-007, and the line this draws is deliberate.
    //
    // `{title}` and `{name}` carry member-authored text that may be Latin,
    // mixed, or end in punctuation — the classic bidi bug, where a Latin
    // title drags its trailing «.» to the wrong end of an Arabic sentence.
    // Those must be `<t>{…}</t>` so the page can wrap them in <bdi>.
    //
    // `{value}` and `{count}` are numerals from formatNumber(), digits sitting
    // between Arabic words, whose directional class resolves correctly without
    // isolation. Where a numeral stands ALONE in a cell rather than inside a
    // sentence, the call site wraps it in <bdi> — see the duration on SCR-018.
    for (const [key, value] of Object.entries(arFlat)) {
      const bare = value.match(/(?<!<t>)\{(title|name)\}/g);
      if (bare) expect(value, `${key} interpolates ${bare.join(", ")} without <t>`).toMatch(/<t>\{/);
    }
  });
});

describe("REQ-INT-004 — logical properties only, in every file this track owns", () => {
  const ROOTS = ["src/app/[locale]/app/propose", "src/app/[locale]/app/admin/proposals", "src/app/[locale]/app/admin/sessions", "src/app/[locale]/app/admin/venues", "src/lib/dal/sessions.ts", "src/components/sessions", "src/lib/dal/proposals.ts"];
  // Physical utilities that have a logical twin. `right-`/`left-` are caught
  // by the inset forms; `text-left`/`text-right` by the alignment forms.
  const PHYSICAL = /\b(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|left|right)-(?:\[|\d|auto|px|full)|\btext-(?:left|right)\b/;

  function files(p: string): string[] {
    const full = join(process.cwd(), p);
    if (statSync(full).isFile()) return [p];
    return readdirSync(full).flatMap((e) => files(join(p, e)));
  }

  it("uses no physical direction utility", () => {
    for (const f of ROOTS.flatMap(files)) {
      const source = readFileSync(join(process.cwd(), f), "utf8");
      for (const line of source.split("\n")) {
        const hit = line.match(PHYSICAL);
        expect(hit, `${f}: ${line.trim()}`).toBeNull();
      }
    }
  });

  it("never clips a text line — tashkeel sits above the line box", () => {
    for (const f of ROOTS.flatMap(files)) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/overflow-hidden|overflow:\s*hidden/);
    }
  });
});
