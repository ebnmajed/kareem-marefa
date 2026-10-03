// DEC-238 §2.3 — the screens name the template `issue_certificate()` really picks. Its fallback orders
// `(org_id is not null) desc, is_default desc, version desc` (0127; 0066 for achievements), so ANY live org template of
// the kind beats the platform's default. `pickEffectiveTemplate()` is that order in TypeScript; the tie the SQL leaves
// to `limit 1` is broken by id, so the screen is stable.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { pickEffectiveTemplate } = await import("@/lib/dal/certificates");

const platformDefault = { id: "p-default", scope: "platform" as const, isDefault: true, version: 3 };
const platformOther = { id: "p-other", scope: "platform" as const, isDefault: false, version: 9 };

describe("the template issuance really picks", () => {
  it("with no org template, the platform's default — not a later platform version", () => {
    expect(pickEffectiveTemplate([platformOther, platformDefault])).toBe("p-default");
  });

  it("★ an org template that is NOT the default still beats the platform's default (the SQL's order)", () => {
    expect(pickEffectiveTemplate([platformDefault, { id: "o-1", scope: "org", isDefault: false, version: 1 }])).toBe("o-1");
  });

  it("among org templates the default wins, whatever its version", () => {
    expect(
      pickEffectiveTemplate([
        { id: "o-new", scope: "org", isDefault: false, version: 7 },
        { id: "o-default", scope: "org", isDefault: true, version: 1 },
      ]),
    ).toBe("o-default");
  });

  it("with no org default, the highest published version; a tie broken by id", () => {
    expect(
      pickEffectiveTemplate([
        { id: "o-b", scope: "org", isDefault: false, version: 1 },
        { id: "o-c", scope: "org", isDefault: false, version: 2 },
      ]),
    ).toBe("o-c");
    expect(
      pickEffectiveTemplate([
        { id: "o-b", scope: "org", isDefault: false, version: 1 },
        { id: "o-a", scope: "org", isDefault: false, version: 1 },
      ]),
    ).toBe("o-a");
  });

  it("nothing to pick is null", () => {
    expect(pickEffectiveTemplate([])).toBeNull();
  });
});
