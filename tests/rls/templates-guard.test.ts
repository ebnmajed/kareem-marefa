// The template guard polices STRUCTURE and no longer polices COLOUR —
// REQ-DSG-005, REQ-DSG-021 as wave 24's re-colour amends it, DEC-242.
//
// ★★ THE WHOLE COLOUR HALF OF THIS SUITE IS INVERTED, and every case is a ledger
// line rather than a deletion: a guard that has stopped refusing something is
// proved to have stopped refusing it. `0055` refused a value starting with `#`
// and `0094` refused anything that was not `{{brand.<token>}}`; the owner's
// ruling is that a brand token is an OPTION an admin may take, not a toll every
// colour pays — «remove the whole brand thing and make it optional … let the
// user do whatever they need».
//
// ★ What the mandate bought, measured against this wave: `DEC-127` justified it
// as stopping «an org that rebrands a gradient whose far end is somebody else's
// colour». It did not stop that. It stopped the product's own design reaching
// its own posters, because `01-tokens.md` has no brand token for tangerine, cyan
// or violet — so five families were painted from the ten tokens and three of
// them came out within 1.22:1 of each other.
//
// ★ The cost, asserted below rather than left to be rediscovered: a template
// whose colours are literals is not repainted when an org saves its brand kit.
// That is the admin's own choice.
//
// Applied with applyProposed() inside each test's rolled-back transaction, and
// only while the file is still under `supabase/proposed/` — once the lead
// promotes it, `supabase db reset` has applied it and the same cases run
// against the migration.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seedBase } from "./fixture";

afterAll(() => pool.end());

const INVALID = "22023";
// ★ The NEWEST guard (wave 24's re-colour): `_drops_the_colour_mandate`
// re-creates the function with the five structural checks and no colour walk at
// all. Applied while it is proposed; once promoted, `supabase db reset` has
// applied it and the same cases run against the migration.
const FILE = "designer/0001_template_guard_drops_the_colour_mandate.sql";

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

describe("POL-design_template_versions — the guard polices structure, not colour (DEC-242)", () => {
  it("guard_gradient_stop_hex — ★ LEDGER: RETIRED. A hex in any stop is now ACCEPTED, and so is the same gradient on tokens", async () => {
    // ★ Was: «a hex literal in ANY stop is refused». `DEC-127` added that case
    // after 0055 let a hex through a gradient — the walk was the right fix for
    // «the guard does not look here», and the REFUSAL was the part that turned
    // out to cost more than it bought.
    await withTx(async (tx) => {
      const { insert } = await setup(tx);

      // Still accepted, and still the thing a template that wants a rebrand to
      // reach it should do.
      expect(await errorCode(() => insert(DOC()))).toBeNull();

      // ★ Now accepted: the literal the canvas paints, in either stop.
      expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: "{{brand.surface}}" }, { color: "#1d2a42" }]) })))).toBeNull();
      expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: "#111a2c" }, { color: "{{brand.canvasRaise}}" }]) })))).toBeNull();
      // And a gradient that is literals end to end.
      expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: "#FF9A2E" }, { color: "#0B0C12" }]) })))).toBeNull();
    });
  });

  it("guard_non_hex_literal — ★ LEDGER: RETIRED. rgb(), a named colour and a hex are now ACCEPTED on every colour field", async () => {
    // ★ Was: «refused on the background, a stop, a layer `color`, `shape.fill`
    // and `shape.stroke` alike». The FIELDS the old guard walked are the thing
    // worth keeping from it, so the same five are exercised — now asserting that
    // none of them refuses.
    await withTx(async (tx) => {
      const { insert } = await setup(tx);

      for (const literal of ["rgb(29, 42, 66)", "navy", "#0B0C12", "#FF9A2E", "transparent", "var(--whatever)"]) {
        expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: literal } }))), `background ${literal}`).toBeNull();
        expect(await errorCode(() => insert(DOC({ background: GRADIENT([{ color: literal }, { color: "{{brand.canvasRaise}}" }]) }))), `stop ${literal}`).toBeNull();
        expect(await errorCode(() => insert(DOC({}, [TEXT("l1", { color: literal })]))), `color ${literal}`).toBeNull();
        const shape = (field: "fill" | "stroke") => ({ id: "l_rule", kind: "shape", frame: { x: 0, y: 0, w: 10, h: 2 }, shape: { type: "rect", [field]: literal } });
        expect(await errorCode(() => insert(DOC({}, [shape("fill")]))), `fill ${literal}`).toBeNull();
        expect(await errorCode(() => insert(DOC({}, [shape("stroke")]))), `stroke ${literal}`).toBeNull();
      }

      // Tokens pass on every one of those fields, including a spaced binding —
      // unchanged, and the assertion that the OPTION still works.
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

  it("guard_design_namespace — ★ `{{design.*}}` is accepted, which is what the baseline posters ship", async () => {
    // ★ The namespace survives the mandate's removal and is the better half of
    // it: a NAMED, PICKABLE palette gives the inspector swatches, which a raw
    // hex never would. The five baseline poster families bind it, and an org
    // that copies one keeps a colour it can re-apply by name.
    //
    // ★ `{{team.colour}}` is accepted too, now — not because a team colour
    // resolves (it does not; it renders the caller's fallback) but because the
    // guard has stopped having an opinion about colour. Making an unresolved
    // binding visible is the renderer's and the studio's job, not a constraint
    // in the database.
    await withTx(async (tx) => {
      const { insert } = await setup(tx);
      for (const ok of ["{{design.tangerine}}", "{{ design.cyan }}", "{{design.ink}}", "{{design.bone}}", "{{design.unicorn}}", "{{team.colour}}"]) {
        expect(await errorCode(() => insert(DOC({ background: { type: "solid", color: ok } }))), `background ${ok}`).toBeNull();
        expect(await errorCode(() => insert(DOC({}, [TEXT("l1", { color: ok })]))), `color ${ok}`).toBeNull();
      }
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
