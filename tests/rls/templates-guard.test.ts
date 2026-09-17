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
const FILE = "designer/0001_template_guard_walks_every_colour.sql";

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
