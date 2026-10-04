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

describe("DEC-242 — the poster's FLAT ground, one colourway per family", () => {
  // ★ LEDGER (wave 24): this block replaced «the poster's version 2». DEC-127's
  // gradient and the Knowledge Network rule are two of the four visual clauses
  // DEC-242 supersedes in REQ-DSG-026, and the thumbnails draw a flat ground on
  // all seven cards. `model.ts`'s gradient union and `backgroundCss()`'s
  // `360 − angle` mirror are untouched and still proven by
  // `tests/unit/gradient-render.test.ts`.
  it("★ every poster family's ground is a SOLID brand token — and no two families share one", () => {
    const grounds = new Set<string>();
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "poster")) {
      const bg = t.document.background;
      expect(bg?.type, t.family).toBe("solid");
      const colour = bg?.type === "solid" ? bg.color : "";
      // A token, never a literal and never a gradient stop.
      expect(colour, t.family).toMatch(/^\{\{brand\.[A-Za-z]+\}\}$/);
      grounds.add(colour);
    }
    // ★ REQ-DSG-033: «each family differs by its colourway, not its structure».
    // Five families, five distinct grounds — which is also what keeps the five
    // documents distinct now that nothing else differs between them.
    expect(grounds.size).toBe(5);
  });

  it("★ the accent reaches a poster as `node`, and never as reading text — DEC-242 §2", () => {
    // `node` is lime on dark and lime-deep on light, and it is the ONLY way the
    // playground's accent enters a document: the other accent, coral, is a
    // STATUS colour (DEC-073) and a brand token must never be one.
    //
    // ★ NOT «every family paints it». The paper colourway — the thumbnails'
    // «ورقي» card — carries no lime at all, and that is the design: it is ink on
    // bone and its pill is ink. The property that holds is the other one: the
    // accent is used, and it is never the colour of a line somebody reads.
    const posters = BASELINE_LIBRARY.filter((x) => x.purpose === "poster");
    const limeSomewhere = posters.filter((t) => colourFieldsOf(t.document).some((c) => c.value === "{{brand.node}}"));
    expect(limeSomewhere.length).toBeGreaterThan(0);
    for (const t of posters) {
      for (const id of ["l_title", "l_presenters", "l_when"]) {
        const layer = t.document.layers.find((l) => l.id === id)!;
        const colour = "color" in layer ? layer.color : null;
        // A 96 px title in lime on ink would pass contrast and still be wrong:
        // the accent marks one thing, and a poster's one thing is its category.
        expect(colour, `${t.family}/${id}`).not.toBe("{{brand.node}}");
      }
    }
  });

  it("★ the Knowledge Network rule is GONE from every composition — DEC-242 §1", () => {
    for (const t of BASELINE_LIBRARY) {
      expect(t.document.layers.find((l) => l.id === "l_rule"), t.family).toBeUndefined();
      expect(t.document.layers.filter((l) => l.name === "عقدة الشبكة"), t.family).toEqual([]);
    }
  });

  it("★ the category pill is a STADIUM of three shapes, because the model has no radius", () => {
    // Adding a `radius` would change a rendered byte, which needs a
    // schemaVersion bump (DEC-178's D2b) — and a bumped document is REFUSED by
    // `main`'s worker for the whole window between the owner's push and the
    // merge, so every poster render would fail. Three shapes at schema 1 are
    // exact and cost nothing.
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "poster")) {
      const caps = t.document.layers.filter((l) => l.id === "l_pill_start" || l.id === "l_pill_end");
      const body = t.document.layers.find((l) => l.id === "l_pill_body");
      expect(caps.map((l) => (l.kind === "shape" ? l.shape.type : null)), t.family).toEqual(["ellipse", "ellipse"]);
      expect(body?.kind === "shape" ? body.shape.type : null, t.family).toBe("rect");
      // A true stadium: each cap is as wide as the pill is tall, and the body
      // spans between their centres.
      for (const cap of caps) expect(cap.frame.w, `${t.family}/${cap.id}`).toBe(cap.frame.h);
      const start = caps.find((l) => l.id === "l_pill_start")!;
      expect(body!.frame.x, t.family).toBe(start.frame.x + Math.round(start.frame.h / 2));
      // The pill sits UNDER its own label.
      const label = t.document.layers.find((l) => l.id === "l_category")!;
      expect((body!.z ?? 0) < (label.z ?? 0), t.family).toBe(true);
    }
  });

  it("★ every document declares BASE_SCHEMA_VERSION — `main`'s worker refuses a version it does not know", () => {
    for (const t of BASELINE_LIBRARY) expect(t.document.schemaVersion, `${t.family}@${t.orientation ?? "poster"}`).toBe(1);
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

describe("A27 · DEC-242 — the family difference is the COLOURWAY, not the structure", () => {
  // ★ LEDGER (wave 24): this block replaced «the family differences are real».
  // The workshop's tasks strip and the venue line are two of the four visual
  // clauses DEC-242 supersedes in REQ-DSG-026 — the thumbnails draw neither —
  // so the two `hideAt` declarations they carried have no subject. What takes
  // their place is REQ-DSG-033's own sentence, asserted directly.
  it("★ the tasks strip and the venue line are gone from every family", () => {
    for (const t of BASELINE_LIBRARY) {
      expect(t.document.layers.find((l) => l.id === "l_tasks"), t.family).toBeUndefined();
      expect(t.document.layers.find((l) => l.id === "l_where"), t.family).toBeUndefined();
    }
  });

  it("★ every poster family has the SAME layer ids in the same order — only the colours differ", () => {
    const posters = BASELINE_LIBRARY.filter((t) => t.purpose === "poster");
    const shape = (d: (typeof posters)[number]["document"]) => d.layers.map((l) => `${l.id}:${l.kind}`).join("|");
    const first = shape(posters[0]!.document);
    for (const t of posters) expect(shape(t.document), t.family).toBe(first);
    // And the documents are still distinct, because the colourway and the
    // category literal differ — which is what makes five rows five rows.
    expect(new Set(posters.map((t) => JSON.stringify(t.document))).size).toBe(5);
  });

  it("★ nothing is dropped on a crop any more: no layer declares `hideAt`", () => {
    // The two layers that did are gone, and every remaining one fits every
    // preset's safe area — proven by `allSafeAreaViolations` below rather than
    // assumed, which is why nothing has to be declared away.
    for (const t of BASELINE_LIBRARY) {
      for (const layer of t.document.layers) expect(layer.hideAt, `${t.family}/${layer.id}`).toBeUndefined();
    }
  });

  it("★ a certificate family is told apart by its kind line — without it two rows would be byte-identical", () => {
    // The thumbnails draw no kind line; the owner kept it (wave 24 ruling 2).
    // This is the assertion that says why: drop `l_kind` and
    // attendance@landscape and presenter@landscape become the same document.
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) {
      const kind = t.document.layers.find((l) => l.id === "l_kind");
      expect(kind?.kind === "text" ? kind.text.literal : null, `${t.family}@${t.orientation}`).toBe(
        { attendance: "شهادة حضور", presenter: "شهادة تقديم", achievement: "شهادة إنجاز" }[t.family as "attendance"],
      );
    }
  });

  it("★ the four layers the thumbnails omit are KEPT, each for a reason a 196 px preview cannot carry", () => {
    for (const t of BASELINE_LIBRARY.filter((x) => x.purpose === "certificate")) {
      const ids = t.document.layers.map((l) => l.id);
      const key = `${t.family}@${t.orientation}`;
      // The bound org logo — 06 §8.3's «one edit in one place», and the subject
      // REQ-DSG-019's A3 resolution guard needs.
      expect(ids, key).toContain("l_logo");
      // The issue date — a certificate that does not say when is a regression.
      expect(ids, key).toContain("l_issued");
      // The reason — how an achievement names the achievement.
      expect(ids, key).toContain("l_reason");
      // REQ-CRT-010 + A29: the serial AND the code, as text beside the QR.
      expect(ids, key).toContain("l_serial");
      expect(ids, key).toContain("l_code");
    }
  });
});

describe("the seed migrations are a copy of this library, and have not drifted", () => {
  // ★ LEDGER (wave 24): the seed list and the «latest» rule both moved.
  // 0061 seeded version 1 of eight compositions and 0098 added version 2 of
  // those plus version 1 of three portraits. Wave 24's seed is ELEVEN NEW ROWS
  // at version 1 (REQ-DSG-034), so «the highest version number across the
  // files» would pick 0098's v2 and compare the OLD document against the new
  // library. The newest FILE wins instead, which is what «the latest seeded
  // version» always meant — file order is migration order.
  /**
   * A seed's body, under `supabase/proposed/designer/` or promoted.
   *
   * ★ `promotedAs` exists because a promotion may RENAME. The fallback derives a
   * suffix from the proposed name, which works while the lead promotes a file
   * under its own name — and wave 24's two proposed files were promoted as ONE
   * migration, `0193_baseline_library_playground.sql`, whose name ends with
   * neither. `db.ts`'s rule is that a test proved under `proposed/` keeps passing
   * the instant it is promoted, so a seed that was renamed says so here rather
   * than returning null and failing as «a migration was not found».
   */
  function seedFile(name: string, promotedAs?: RegExp): string | null {
    const proposed = join(process.cwd(), "supabase", "proposed", "designer", name);
    if (existsSync(proposed)) return readFileSync(proposed, "utf8");
    const dir = join(process.cwd(), "supabase", "migrations");
    const suffix = name.replace(/^\d+_/, "_");
    const promoted = readdirSync(dir).find((f) => (promotedAs ? promotedAs.test(f) : f.endsWith(suffix)));
    return promoted ? readFileSync(join(dir, promoted), "utf8") : null;
  }

  it("★ the latest seeded version of every composition deep-equals the library, dynamic fields included", () => {
    // Oldest first: the last file to mention a composition is the live one.
    const bodies = [
      seedFile("0004_baseline_library.sql"),
      seedFile("0002_certificate_library.sql"),
      // Promoted as `0193_baseline_library_playground.sql`, together with the
      // supersede function it calls.
      seedFile("0005_playground_library.sql", /_baseline_library_playground\.sql$/),
    ];
    if (bodies.some((b) => b === null)) {
      expect.fail("a baseline-library seed migration (0061's, or the wave-8 certificate library) was not found");
      return;
    }

    const latest = new Map<string, { version: number; document: unknown; fields: unknown }>();
    for (const body of bodies as string[]) {
      // `-- @family <family>[@<orientation>][@v<n>]`, then the version's
      // `$json$…$json$` and `$fields$…$fields$` before the next marker.
      // ★ LEDGER (wave 24): the separator between the two dollar-quoted blocks is
      // now `::jsonb;` as well as `::jsonb,`. 0061 and 0098 inline both literals
      // as arguments of one INSERT; wave 24's seed assigns each to a variable
      // first, because its idempotency key is the DOCUMENT and the lookup needs
      // it before the insert does. Both shapes are parsed, so the two older
      // seeds are read exactly as before.
      for (const match of body.matchAll(/--\s*@family\s+(\S+)((?:(?!--\s*@family)[\s\S])*?)\$json\$([\s\S]*?)\$json\$::jsonb[,;][\s\S]*?\$fields\$([\s\S]*?)\$fields\$/g)) {
        const parts = (match[1] as string).split("@");
        const family = parts[0] as string;
        const versionTag = parts.find((p) => /^v\d+$/.test(p));
        const orientation = parts.find((p) => p === "landscape" || p === "portrait");
        const isCertificate = ["attendance", "presenter", "achievement"].includes(family);
        const key = isCertificate ? `${family}@${orientation ?? "landscape"}` : family;
        const version = versionTag ? Number(versionTag.slice(1)) : 1;
        // ★ The newest FILE wins, unconditionally — not the highest version
        // number. A later migration may seed a NEW row at version 1, and that
        // row is the live one.
        latest.set(key, { version, document: JSON.parse(match[3] as string), fields: JSON.parse(match[4] as string) });
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
