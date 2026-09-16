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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allSafeAreaViolations,
  BASELINE_LIBRARY,
  brandViolations,
  colourFieldsOf,
  declaredBindingsOf,
  dynamicFieldsOf,
  orientationOf,
  presetsFor,
  presetsForDocument,
  validateDocument,
  type DesignDocument,
} from "@kareem/designer-runtime";

describe("06 §3.3 as DEC-148 rules it — a row is a COMPOSITION", () => {
  it("five poster families, and three certificate families each landscape and portrait", () => {
    expect(BASELINE_LIBRARY.filter((t) => t.purpose === "poster").map((t) => t.family)).toEqual(["talk", "workshop", "panel", "meetup", "announcement"]);
    expect(BASELINE_LIBRARY.filter((t) => t.purpose === "certificate").map((t) => `${t.family}@${t.orientation}`)).toEqual([
      "attendance@landscape",
      "attendance@portrait",
      "presenter@landscape",
      "presenter@portrait",
      "achievement@landscape",
      "achievement@portrait",
    ]);
  });

  it("★ eleven rows, never more: the scheme is a palette, not a row", () => {
    // Every colour is a token, so a light row and a dark row of one family
    // would be byte-identical documents — the second thing to keep in step,
    // and the dark one nobody looks at would drift. Literal, so a short
    // library cannot shrink its own expectation.
    expect(BASELINE_LIBRARY).toHaveLength(11);
    const documents = BASELINE_LIBRARY.map((t) => JSON.stringify(t.document));
    expect(new Set(documents).size).toBe(11);
  });

  it("a certificate's orientation IS its master — landscape 3508 × 2480, portrait 2480 × 3508", () => {
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) {
      expect(orientationOf(t.document), `${t.family}@${t.orientation}`).toBe(t.orientation);
      expect(presetsForDocument(t.document), `${t.family}@${t.orientation}`).toEqual([t.orientation === "landscape" ? "cert_landscape" : "cert_portrait"]);
    }
  });

  it("one platform default per family: every poster, and the landscape certificates", () => {
    for (const t of BASELINE_LIBRARY) expect(t.isDefault, `${t.family}@${t.orientation ?? "poster"}`).toBe(t.purpose === "poster" || t.orientation === "landscape");
  });

  it("every composition is named in Arabic", () => {
    for (const t of BASELINE_LIBRARY) expect(t.name, t.family).toMatch(/^[؀-ۿ\s]+$/);
  });
});

describe("DEC-127 · DEC-148 q4 — the poster's version 2", () => {
  it("★ every poster family's background is DEC-127's gradient, exactly, in tokens", () => {
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "poster")) {
      expect(t.document.background, t.family).toEqual({ type: "gradient", angle: 140, stops: [{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }] });
    }
  });

  it("the Knowledge Network rule binds edgeStrong on posters (q4) and stays on spine on certificates", () => {
    for (const t of BASELINE_LIBRARY) {
      const rule = t.document.layers.find((l) => l.id === "l_rule");
      expect(rule?.kind === "shape" ? rule.shape.fill : null, t.family).toBe(t.purpose === "poster" ? "{{brand.edgeStrong}}" : "{{brand.spine}}");
    }
  });

  it("certificates stay solid — the gradient is the poster's", () => {
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) expect(t.document.background).toEqual({ type: "solid", color: "{{brand.canvas}}" });
  });

  it("★ every text line is at least one line tall at its own size — the frame that made every export warn", () => {
    // 40 px at a 1.7 line height is a 68 px line, and a 60 px frame reported
    // «reached its minimum size» on every preset of every session (the 390 px
    // review found it). An auto-fitting layer must hold one line at its floor.
    for (const t of BASELINE_LIBRARY) {
      for (const layer of t.document.layers) {
        if (layer.kind !== "text" && layer.kind !== "dynamic_field") continue;
        const size = layer.autoFit ? (layer.font.minSize ?? layer.font.size) : layer.font.size;
        const line = Math.ceil(size * (layer.font.lineHeight ?? 1.7));
        expect(layer.frame.h, `${t.family}@${t.orientation ?? "poster"}/${layer.id}`).toBeGreaterThanOrEqual(line);
      }
    }
  });

  it("every layer has a name, so the layer list never shows an id", () => {
    for (const t of BASELINE_LIBRARY) for (const layer of t.document.layers) expect(layer.name, `${t.family}/${layer.id}`).toBeTruthy();
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

  it("★ every colour is a brand token that EXISTS — a gradient stop, rgb() and a misspelt token included (DEC-127)", () => {
    const base = BASELINE_LIBRARY[0]!.document;
    const gradient = (stops: Array<{ color: string }>): DesignDocument => ({ ...base, background: { type: "gradient", angle: 140, stops } });

    expect(brandViolations(gradient([{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }]))).toEqual([]);
    expect(brandViolations(gradient([{ color: "{{brand.surface}}" }, { color: "#1d2a42" }])).join(" ")).toContain("hard-coded colour");
    expect(brandViolations(gradient([{ color: "rgb(29, 42, 66)" }, { color: "{{brand.canvasRaise}}" }])).join(" ")).toContain(
      "background.stops[0].color = rgb(29, 42, 66)",
    );
    expect(brandViolations(gradient([{ color: "{{brand.surface}}" }, { color: "{{brand.canvsRaise}}" }])).join(" ")).toContain("unknown brand colour");
    // A hex is reported once, not twice by the two checks.
    expect(brandViolations(gradient([{ color: "{{brand.surface}}" }, { color: "#1d2a42" }]))).toHaveLength(1);
  });

  it("colourFieldsOf names every colour-bearing field — the background or each stop, color, fill, stroke", () => {
    const base = BASELINE_LIBRARY[0]!.document;
    const doc: DesignDocument = {
      ...base,
      background: { type: "gradient", angle: 140, stops: [{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }] },
      layers: [
        { id: "t", kind: "text", frame: { x: 0, y: 0, w: 1, h: 1 }, text: { literal: "ن" }, font: { family: "Amiri", size: 10 }, color: "{{brand.fgBody}}" },
        { id: "s", kind: "shape", frame: { x: 0, y: 0, w: 1, h: 1 }, shape: { type: "rect", fill: "{{brand.spine}}", stroke: "{{brand.edge}}" } },
        { id: "q", kind: "qr", frame: { x: 0, y: 0, w: 1, h: 1 }, qr: { binding: "session.eventUrl" } },
      ],
    };
    expect(colourFieldsOf(doc).map((c) => c.path)).toEqual([
      "background.stops[0].color",
      "background.stops[1].color",
      "layers[0].color",
      "layers[1].shape.fill",
      "layers[1].shape.stroke",
    ]);
    expect(colourFieldsOf({ ...doc, background: { type: "solid", color: "{{brand.canvas}}" }, layers: [] }).map((c) => c.path)).toEqual(["background.color"]);
  });

  it("★ the database's template guard walks the SAME colour fields as colourFieldsOf()", () => {
    // Two lists of «where a colour lives» — this one and the SQL guard's —
    // are one list only if something holds them together. Read from the
    // proposed file while it exists, else from the promoted migration.
    const proposed = join(process.cwd(), "supabase", "proposed", "designer", "0001_template_guard_walks_every_colour.sql");
    const promotedDir = join(process.cwd(), "supabase", "migrations");
    const promoted = readdirSync(promotedDir).find((f) => f.endsWith("_template_guard_walks_every_colour.sql"));
    const file = existsSync(proposed) ? proposed : promoted ? join(promotedDir, promoted) : null;
    if (!file) {
      expect.fail("neither the proposed nor the promoted template-guard migration was found");
      return;
    }
    const sql = readFileSync(file, "utf8");
    expect(sql).toContain(`new.document->'background'->>'color'`);
    expect(sql).toContain(`new.document->'background'->'stops'`);
    expect(sql).toContain(`v_stop->>'color'`);
    expect(sql).toContain(`v_layer->>'color'`);
    expect(sql).toContain(`v_layer#>>'{shape,fill}'`);
    expect(sql).toContain(`v_layer#>>'{shape,stroke}'`);
    // …and an allowlist of the binding shape, not a denylist of `#`.
    expect(sql).toContain(String.raw`!~ '^\{\{\s*brand\.[A-Za-z]+\s*\}\}$'`);
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

describe("the seed migrations are a copy of this library, and have not drifted", () => {
  // 0061 seeded version 1 of eight compositions; the wave-8 seed adds version
  // 2 of those and version 1 of the three portraits. The LATEST version of
  // each composition across both files must be exactly the library's.
  function seedFile(name: string): string | null {
    const proposed = join(process.cwd(), "supabase", "proposed", "designer", name);
    if (existsSync(proposed)) return readFileSync(proposed, "utf8");
    const suffix = name.replace(/^\d+_/, "_");
    const promoted = readdirSync(join(process.cwd(), "supabase", "migrations")).find((f) => f.endsWith(suffix));
    return promoted ? readFileSync(join(process.cwd(), "supabase", "migrations", promoted), "utf8") : null;
  }

  it("★ the latest seeded version of every composition deep-equals the library, dynamic fields included", () => {
    const bodies = [seedFile("0004_baseline_library.sql"), seedFile("0002_certificate_library.sql")];
    if (bodies.some((b) => b === null)) {
      expect.fail("a baseline-library seed migration (0061's, or the wave-8 certificate library) was not found");
      return;
    }

    const latest = new Map<string, { version: number; document: unknown; fields: unknown }>();
    for (const body of bodies as string[]) {
      // `-- @family <family>[@<orientation>][@v<n>]`, then the version's
      // `$json$…$json$` and `$fields$…$fields$` before the next marker.
      for (const match of body.matchAll(/--\s*@family\s+(\S+)((?:(?!--\s*@family)[\s\S])*?)\$json\$([\s\S]*?)\$json\$::jsonb,\s*\$fields\$([\s\S]*?)\$fields\$/g)) {
        const parts = (match[1] as string).split("@");
        const family = parts[0] as string;
        const versionTag = parts.find((p) => /^v\d+$/.test(p));
        const orientation = parts.find((p) => p === "landscape" || p === "portrait");
        const isCertificate = ["attendance", "presenter", "achievement"].includes(family);
        const key = isCertificate ? `${family}@${orientation ?? "landscape"}` : family;
        const version = versionTag ? Number(versionTag.slice(1)) : 1;
        const existing = latest.get(key);
        if (!existing || existing.version < version) {
          latest.set(key, { version, document: JSON.parse(match[3] as string), fields: JSON.parse(match[4] as string) });
        }
      }
    }

    const keyOf = (t: (typeof BASELINE_LIBRARY)[number]) => (t.purpose === "certificate" ? `${t.family}@${t.orientation}` : t.family);
    expect([...latest.keys()].sort()).toEqual(BASELINE_LIBRARY.map(keyOf).sort());
    for (const t of BASELINE_LIBRARY) {
      const seeded = latest.get(keyOf(t));
      expect(seeded?.version, `${keyOf(t)} version`).toBe(t.version);
      expect(seeded?.document, `${keyOf(t)} has drifted from the library`).toEqual(JSON.parse(JSON.stringify(t.document)));
      expect(seeded?.fields, `${keyOf(t)} dynamic fields`).toEqual(dynamicFieldsOf(t.document));
    }
  });
});
