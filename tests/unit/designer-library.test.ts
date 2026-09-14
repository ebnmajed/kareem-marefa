// The baseline template library — REQ-DSG-026, A27, DEC-003, 06 §3.3.
//
// «No open books, no graduation caps, no lightbulbs, no traditional
// education iconography, no cartoon illustration — and by project policy no
// icon libraries, no emoji, no photography.» A style guide nobody opens
// while designing is a style guide that is not followed, so the rules are a
// function the library is held to here, and the same function any future
// template screen can call.
//
// The last block is the anti-drift check: the seed migration's JSON must
// deep-equal this library. The library is the source, the SQL is a copy, and
// a copy nobody compares is a copy that diverges.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allSafeAreaViolations,
  BASELINE_LIBRARY,
  brandViolations,
  declaredBindingsOf,
  presetsFor,
  validateDocument,
  type DesignDocument,
} from "@kareem/designer-runtime";

describe("06 §3.3 — the library is the families the document names", () => {
  it("five poster families and three certificate families", () => {
    expect(BASELINE_LIBRARY.filter((t) => t.purpose === "poster").map((t) => t.family)).toEqual([
      "talk",
      "workshop",
      "panel",
      "meetup",
      "announcement",
    ]);
    expect(BASELINE_LIBRARY.filter((t) => t.purpose === "certificate").map((t) => t.family)).toEqual(["attendance", "presenter", "achievement"]);
  });

  it("every family is named in Arabic", () => {
    for (const t of BASELINE_LIBRARY) expect(t.name, t.family).toMatch(/^[؀-ۿ\s]+$/);
  });

  it("★ ONE template per family, not one per light/dark — the variant is the scheme", () => {
    // Every colour is a token, so the same document renders light or dark by
    // which palette resolves. A second document per family would be a second
    // thing to keep in step, and the one that drifted would be the dark one
    // nobody looks at.
    expect(BASELINE_LIBRARY).toHaveLength(8);
    expect(new Set(BASELINE_LIBRARY.map((t) => t.family)).size).toBe(8);
  });
});

describe("REQ-DSG-026 — the brand constraint", () => {
  it("★ no template carries a hard-coded colour, an emoji, or an image that is not the bound logo", () => {
    for (const t of BASELINE_LIBRARY) expect(brandViolations(t.document), `${t.purpose}/${t.family}`).toEqual([]);
  });

  it("the check is not vacuous — it catches each of the three", () => {
    const base = BASELINE_LIBRARY[0]!.document;
    const withHex: DesignDocument = { ...base, background: { type: "solid", color: "#0B1220" } };
    expect(brandViolations(withHex).join(" ")).toContain("hard-coded colour");

    const withEmoji: DesignDocument = {
      ...base,
      layers: [{ ...base.layers[1]!, text: { literal: "ورشة 🎓" } } as never],
    };
    expect(brandViolations(withEmoji).join(" ")).toContain("emoji");

    const withPhoto: DesignDocument = {
      ...base,
      layers: [{ id: "p", kind: "image", frame: { x: 0, y: 0, w: 10, h: 10 }, image: { assetId: "some-photo" } } as never],
    };
    expect(brandViolations(withPhoto).join(" ")).toContain("embeds an asset");
  });

  it("the only image layer anywhere is the org logo, bound rather than embedded", () => {
    for (const t of BASELINE_LIBRARY) {
      for (const layer of t.document.layers) {
        if (layer.kind !== "image") continue;
        expect(layer.image.binding, `${t.family}/${layer.id}`).toBe("brand.logoAssetId");
      }
    }
  });

  it("uses only the permitted geometry — rectangles and ellipses, the dots and lines of the network", () => {
    for (const t of BASELINE_LIBRARY) {
      for (const layer of t.document.layers) {
        if (layer.kind !== "shape") continue;
        expect(["rect", "ellipse", "line"], `${t.family}/${layer.id}`).toContain(layer.shape.type);
      }
    }
  });
});

describe("every template is a valid, renderable document", () => {
  it("validates against the runtime's own schema", () => {
    for (const t of BASELINE_LIBRARY) {
      const result = validateDocument(t.document);
      expect(result.ok ? [] : result.issues.map((i) => `${i.path}:${i.code}`), `${t.purpose}/${t.family}`).toEqual([]);
    }
  });

  it("★ fits its safe area on EVERY preset it will be exported at", () => {
    // A template that overflows on `og` is a template that ships a cramped
    // link preview to every session that uses it.
    for (const t of BASELINE_LIBRARY) {
      const violations = allSafeAreaViolations(t.document).map((v) => `${v.preset}/${v.layerId}`);
      expect(violations, `${t.purpose}/${t.family}`).toEqual([]);
    }
  });

  it("derives for every preset of its purpose without losing a layer it did not declare hidden", () => {
    for (const t of BASELINE_LIBRARY) {
      for (const preset of presetsFor(t.document.purpose)) {
        const expected = t.document.layers.filter((l) => !(l.hideAt ?? []).includes(preset)).length;
        expect(declaredBindingsOf(t.document).length, `${t.family} bindings`).toBeGreaterThan(0);
        expect(expected, `${t.family}/${preset}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("the locked regions a certificate cannot ship without", () => {
  it("★ every certificate locks its QR, its serial, its code and its signature block", () => {
    // A certificate whose verification QR someone dragged off the page
    // cannot be verified, and the failure only appears after it is printed
    // and handed over (REQ-DSG-024, 06 §3.4).
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) {
      const locked = t.document.layers.filter((l) => l.locked).map((l) => l.id);
      expect(locked, t.family).toEqual(expect.arrayContaining(["l_qr", "l_serial", "l_code", "l_signature"]));
    }
  });

  it("prints BOTH identifiers beside the QR — a QR that will not scan needs a fallback a human can type", () => {
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) {
      const bindings = declaredBindingsOf(t.document);
      expect(bindings, t.family).toContain("certificate.serial");
      expect(bindings, t.family).toContain("certificate.verificationCode");
      expect(bindings, t.family).toContain("certificate.verifyUrl");
    }
  });

  it("★ the certificate QR is at least 25 mm and stays that size on every variant (REQ-CRT-010)", () => {
    // 25 mm at 300 dpi is 295 px. `fixed` is what keeps it 25 mm on the
    // portrait variant instead of shrinking with the page until it stops
    // scanning.
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) {
      const qr = t.document.layers.find((l) => l.id === "l_qr");
      expect(qr?.frame.w, t.family).toBeGreaterThanOrEqual(Math.round((25 * 300) / 25.4));
      expect(qr?.presets?.default?.scale, t.family).toBe("fixed");
    }
  });

  it("the poster QR is locked too, and binds the session's absolute URL", () => {
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "poster")) {
      const qr = t.document.layers.find((l) => l.id === "l_qr");
      expect(qr?.locked, t.family).toBe(true);
      expect(qr?.kind === "qr" ? qr.qr.binding : null, t.family).toBe("session.eventUrl");
    }
  });
});

describe("A27 — the family differences are real", () => {
  it("the workshop family carries a preparatory-tasks strip and no other family does", () => {
    const withTasks = BASELINE_LIBRARY.filter((t) => t.document.layers.some((l) => l.id === "l_tasks")).map((t) => t.family);
    expect(withTasks).toEqual(["workshop"]);
  });

  it("what does not survive a crop is DECLARED — the venue line and the task strip name their presets", () => {
    const talk = BASELINE_LIBRARY.find((t) => t.family === "talk")!.document;
    expect(talk.layers.find((l) => l.id === "l_where")?.hideAt).toEqual(["og"]);
    const workshop = BASELINE_LIBRARY.find((t) => t.family === "workshop")!.document;
    expect(workshop.layers.find((l) => l.id === "l_tasks")?.hideAt).toEqual(["og", "square"]);
  });
});

describe("the seed migration is a copy of this library, and has not drifted", () => {
  const sql = join(process.cwd(), "supabase", "proposed", "designer", "0004_baseline_library.sql");
  const promoted = join(process.cwd(), "supabase", "migrations");

  it("★ every document in the SQL deep-equals the one here", () => {
    // Guarded so a promotion mid-session does not turn this red: once the
    // lead moves the file, the same check runs against the migration.
    let body: string | null = null;
    if (existsSync(sql)) body = readFileSync(sql, "utf8");
    else {
      const { readdirSync } = require("node:fs") as typeof import("node:fs");
      const promotedFile = readdirSync(promoted).find((f) => f.endsWith("_baseline_library.sql"));
      if (promotedFile) body = readFileSync(join(promoted, promotedFile), "utf8");
    }
    if (!body) {
      expect.fail("neither the proposed nor the promoted baseline-library migration was found");
      return;
    }

    // Each template is seeded as `$json$…$json$::jsonb`, one per family.
    const found = new Map<string, unknown>();
    // The marker and the literal are separated by the insert statement, so
    // the gap is "anything but another marker" rather than whitespace.
    for (const match of body.matchAll(/--\s*@family\s+(\S+)(?:(?!--\s*@family)[\s\S])*?\$json\$([\s\S]*?)\$json\$/g)) {
      found.set(match[1] as string, JSON.parse(match[2] as string));
    }
    expect([...found.keys()].sort()).toEqual(BASELINE_LIBRARY.map((t) => t.family).sort());
    for (const t of BASELINE_LIBRARY) {
      expect(found.get(t.family), `${t.family} has drifted from the library`).toEqual(JSON.parse(JSON.stringify(t.document)));
    }
  });
});
