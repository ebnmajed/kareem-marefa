// DEC-238 §2.3 — the screens name the template issuance really picks. ★ LEDGER C-7 (wave 27, DEC-254 §3, DEC-255 D10):
// there is no platform library, so the candidates are the org's own and the order is `org_template_version()`'s —
// `is_default desc, version desc, id`. The platform cases left with the platform: «with no org template, the platform's
// default» and «an org template beats the platform's default» have no subject, because every org is seeded with a
// default per kind and nothing else is a candidate. `pickEffectiveTemplate()` is that order in TypeScript.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { pickEffectiveTemplate } = await import("@/lib/dal/certificates");

describe("the template issuance really picks", () => {
  it("the default wins, whatever its version", () => {
    expect(
      pickEffectiveTemplate([
        { id: "o-new", isDefault: false, version: 7 },
        { id: "o-default", isDefault: true, version: 1 },
      ]),
    ).toBe("o-default");
  });

  it("with no default, the highest published version; a tie broken by id", () => {
    expect(
      pickEffectiveTemplate([
        { id: "o-b", isDefault: false, version: 1 },
        { id: "o-c", isDefault: false, version: 2 },
      ]),
    ).toBe("o-c");
    expect(
      pickEffectiveTemplate([
        { id: "o-b", isDefault: false, version: 1 },
        { id: "o-a", isDefault: false, version: 1 },
      ]),
    ).toBe("o-a");
  });

  it("nothing to pick is null", () => {
    expect(pickEffectiveTemplate([])).toBeNull();
  });
});

// ★ The owner's tie guard (wave 23, DEC-238): what a screen may NAME. The id tiebreak above only preselects a preview.
describe("the template a screen may name (resolveEffectiveDefault)", () => {
  it("★ two non-default templates of one kind, both on v1: neither is named — «لا قالب افتراضي»", async () => {
    const { resolveEffectiveDefault } = await import("@/lib/dal/certificates");
    expect(
      resolveEffectiveDefault([
        { id: "o-a", isDefault: false, version: 1 },
        { id: "o-b", isDefault: false, version: 1 },
      ]),
    ).toEqual({ status: "no_default" });
  });

  it("a template that is not flagged is not named either, though issuance would take it", async () => {
    const { resolveEffectiveDefault } = await import("@/lib/dal/certificates");
    expect(resolveEffectiveDefault([{ id: "o-1", isDefault: false, version: 3 }])).toEqual({ status: "no_default" });
  });

  it("the flagged default is named; with no template at all, none", async () => {
    const { resolveEffectiveDefault } = await import("@/lib/dal/certificates");
    expect(
      resolveEffectiveDefault([
        { id: "o-d", isDefault: true, version: 1 },
        { id: "o-x", isDefault: false, version: 5 },
      ]),
    ).toEqual({ status: "named", id: "o-d" });
    expect(resolveEffectiveDefault([])).toEqual({ status: "none" });
  });
});
