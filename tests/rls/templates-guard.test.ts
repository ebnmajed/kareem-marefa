// The template guard walks every colour — REQ-DSG-021, DEC-127, DEC-148.
//
// `supabase/proposed/designer/0001_template_guard_walks_every_colour.sql`
// re-creates 0055's `design_template_versions_guard()`. 0055 read
// `background.color`, which a gradient does not have, and refused only a value
// starting with `#`: a hex in a gradient stop, `rgb(…)` and `navy` all passed.
//
// Applied with applyProposed() inside each test's rolled-back transaction, and
// only while the file is still under `supabase/proposed/` — once the lead
// promotes it, `supabase db reset` has applied it and the same cases run
// against the migration.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, pool, withTx, type Tx } from "./db";
import { seedBase } from "./fixture";

afterAll(() => pool.end());

const INVALID = "22023";
// ★ The NEWEST guard (wave 24's re-colour): `_admits_design_colours` re-creates
// the function again, adding the `design.*` namespace and refusing everything
// 0094 refused. Applied while it is proposed; once promoted, `supabase db reset`
// has applied it and the same cases run against the migration.
const FILE = "designer/0001_template_guard_admits_design_colours.sql";

const TEXT = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "text",
  frame: { x: 0, y: 0, w: 100, h: 50 },
  text: { literal: "عنوان" },
  font: { family: "Reem Kufi", size: 48 },
  color: "{{brand.fgHeading}}",
  ...extra,
});

const GRADIENT = (stops: Array<{ color: string }>) => ({ type: "gradient", angle: 140, stops });

const DOC = (over: Record<string, unknown> = {}, layers: unknown[] = [TEXT("l_title")]) => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction: "rtl",
  background: GRADIENT([{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }]),
  layers,
  ...over,
});

async function setup(tx: Tx) {
  const f = await seedBase(tx);
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
  await tx.asOwner();
  const [t] = await tx.q<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'poster', 'talk', 'قالب الحارس') returning id`,
    [f.a.id],
  );
  let version = 0;
  // A fresh version number per attempt, so a refusal is the guard's and never
  // the (template_id, version) unique key's.
  const insert = (doc: unknown) =>
    tx.q(`insert into public.design_template_versions (template_id, version, document) values ($1, $2, $3::jsonb)`, [
      t.id,
      ++version,
      JSON.stringify(doc),
    ]);
  return { insert };
}

describe("POL-design_template_versions — the guard walks every colour (DEC-127)", () => {
  it("guard_gradient_stop_hex — a hex literal in ANY stop is refused; the same gradient on tokens is accepted", async () => {
    await withTx(async (tx) => {
      const { insert } = await setup(tx);

      // DEC-127's own background, on tokens — the whole point of the rule.
      expect(await errorCode(() => insert(DOC()))).toBeNull();

      // The literal the canvas paints, in the second stop — what 0055 let through.
      expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: "{{brand.surface}}" }, { color: "#1d2a42" }]) })))).toBe(INVALID);
      // And in the first, so the walk is not «the last stop only».
      expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: "#111a2c" }, { color: "{{brand.canvasRaise}}" }]) })))).toBe(INVALID);

      const message = await errorMessage(() =>
        insert(DOC({ background: GRADIENT([{ color: "{{brand.surface}}" }, { color: "#1d2a42" }]) })),
      );
      expect(message).toContain("hardcoded_colour_in_template");
      expect(message).toContain("background.stops[1].color");
    });
  });

  it("guard_non_hex_literal — rgb(), a named colour and a non-brand binding are refused on every colour field", async () => {
    await withTx(async (tx) => {
      const { insert } = await setup(tx);

      for (const literal of ["rgb(29, 42, 66)", "navy", "{{session.title}}", "transparent"]) {
        expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: literal } }))), `background ${literal}`).toBe(INVALID);
        expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: literal }, { color: "{{brand.canvasRaise}}" }]) }))), `stop ${literal}`).toBe(
          INVALID,
        );
        expect(await errorCode(() => insert(DOC({}, [TEXT("l1", { color: literal })]))), `color ${literal}`).toBe(INVALID);
        const shape = (field: "fill" | "stroke") => ({ id: "l_rule", kind: "shape", frame: { x: 0, y: 0, w: 10, h: 2 }, shape: { type: "rect", [field]: literal } });
        expect(await errorCode(() => insert(DOC({}, [shape("fill")]))), `fill ${literal}`).toBe(INVALID);
        expect(await errorCode(() => insert(DOC({}, [shape("stroke")]))), `stroke ${literal}`).toBe(INVALID);
      }

      // Tokens pass on every one of those fields, including a spaced binding.
      expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: "{{ brand.canvas }}" } })))).toBeNull();
      expect(
        await errorCode(() =>
          insert(DOC({}, [{ id: "l_rule", kind: "shape", frame: { x: 0, y: 0, w: 10, h: 2 }, shape: { type: "rect", fill: "{{brand.spine}}", stroke: "{{brand.edge}}" } }])),
        ),
      ).toBeNull();
      // No background at all is not a colour, and not refused.
      expect(await errorCode(() => insert(DOC({ background: undefined })))).toBeNull();
    });
  });

  it("guard_design_namespace — ★ `{{design.*}}` is accepted, and the guard refuses everything it refused before", async () => {
    // ★★ THE PROOF THE GUARD DID NOT WEAKEN, case by case.
    //
    // The new pattern is the old one with the literal `brand` replaced by
    // `(brand|design)`. The argument is exhaustive rather than a sample: if a
    // string matched the old pattern it still matches through the `brand`
    // branch; if it did NOT, it can match the new one only through the `design`
    // branch — only if it has the form `{{` `\s*` `design.` `[A-Za-z]+` `\s*`
    // `}}`. So the newly-accepted set is exactly the well-formed `design`
    // bindings. These cases are that argument, executed against the database.
    await withTx(async (tx) => {
      const { insert } = await setup(tx);

      // ── accepted, on every colour field ────────────────────────────────────
      for (const ok of ["{{design.tangerine}}", "{{ design.cyan }}", "{{design.ink}}", "{{design.bone}}"]) {
        expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: ok } }))), `background ${ok}`).toBeNull();
        expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: ok }, { color: "{{brand.canvasRaise}}" }]) }))), `stop ${ok}`).toBeNull();
        expect(await errorCode(() => insert(DOC({}, [TEXT("l1", { color: ok })]))), `color ${ok}`).toBeNull();
        const shape = (field: "fill" | "stroke") => ({ id: "l_rule", kind: "shape", frame: { x: 0, y: 0, w: 10, h: 2 }, shape: { type: "rect", [field]: ok } });
        expect(await errorCode(() => insert(DOC({}, [shape("fill")]))), `fill ${ok}`).toBeNull();
        expect(await errorCode(() => insert(DOC({}, [shape("stroke")]))), `stroke ${ok}`).toBeNull();
      }

      // ★ MEMBERSHIP IS STILL NOT THE DATABASE'S JOB, and this asserts the seam
      // rather than leaving it to be rediscovered: a well-formed binding to a
      // name that does not exist is ACCEPTED here and renders the caller's
      // fallback, exactly as `{{brand.canvsRaise}}` does. `brandViolations()`
      // owns membership, beside the list, so there is one copy of it.
      expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: "{{design.unicorn}}" } })))).toBeNull();

      // ── still refused ─────────────────────────────────────────────────────
      const refused = [
        "#0B0C12",
        "#FF9A2E",
        "rgb(255, 154, 46)",
        "navy",
        "transparent",
        "var(--color-ink)",
        // The third tier the artboard draws and DEC-242 §2 deferred: a team
        // colour still cannot reach a template, and that is deliberate.
        "{{team.colour}}",
        "{{design}}",
        "{{design.}}",
        "{{design.tan-gerine}}",
        "{{design.tangerine2}}",
        "{{design.a.b}}",
        "{{designer.tangerine}}",
        "{{ design.cyan }} ",
        "{{brand.canvas}}{{design.ink}}",
      ];
      for (const bad of refused) {
        expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: bad } }))), `background ${bad}`).toBe(INVALID);
        expect(await errorCode(() => insert(DOC({}, [TEXT("l1", { color: bad })]))), `color ${bad}`).toBe(INVALID);
      }

      // The message still names the field and keeps 0055's prefix, so a caller
      // matching it still matches.
      const message = await errorMessage(() => insert(DOC({}, [TEXT("l_title", { color: "{{team.colour}}" })])));
      expect(message).toContain("hardcoded_colour_in_template");
      expect(message).toContain("layer l_title color");
    });
  });

  it("guard_structure_kept — 0055's structural refusals still hold", async () => {
    await withTx(async (tx) => {
      const { insert } = await setup(tx);
      expect(await errorCode(() => insert({ ...DOC(), schemaVersion: undefined }))).toBe(INVALID);
      expect(await errorCode(() => insert({ ...DOC(), layers: {} }))).toBe(INVALID);
      expect(await errorCode(() => insert(DOC({}, [{ ...TEXT("l1"), id: undefined }])))).toBe(INVALID);
      expect(await errorCode(() => insert(DOC({}, [TEXT("l1"), TEXT("l1")])))).toBe(INVALID);
      expect(await errorCode(() => insert(DOC({}, [TEXT("l1", { kind: "video" })])))).toBe(INVALID);
    });
  });
});
