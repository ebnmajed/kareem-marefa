// The status-colour contrast guard's SQL formula, checked against its
// TypeScript twin — wave 11 (DEC-166 §2), `supabase/proposed/branding/
// 0003_status_contrast_guard.sql`.
//
// `save_brand_kit()`'s new guard has to run IN THE DATABASE (16 §16.6: "that
// is REQ-NFR-007 at the one place it can actually be enforced"), so
// `public.wcag_relative_luminance()`/`wcag_contrast_ratio()` are a THIRD copy
// of the WCAG 2.x §1.4.3 formula `src/lib/brand/contrast.ts` and
// `tests/unit/status-tokens.test.ts` each already carry in TypeScript. A
// plain-text warning that the two must agree is not a reader — this file is:
// it feeds the same pairs through both languages and fails the moment either
// one drifts.
//
// ★ This lives under `tests/rls/`, not `tests/unit/`, on the lead's
// correction at sync 1: CI's unit job has no database, and this test needs
// one to call the SQL side at all.
import { afterAll, describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/brand/contrast";
import { applyProposed, pool, withTx, type Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "branding/0003_status_contrast_guard.sql";

async function sqlRatio(tx: Tx, a: string, b: string): Promise<number> {
  const [row] = await tx.q<{ ratio: string }>(`select public.wcag_contrast_ratio($1, $2) as ratio`, [a, b]);
  return Number(row.ratio);
}

// The exact six pairs `status_contrast_failure()` checks, plus a handful of
// arbitrary ones — agreement has to hold everywhere, not only at the six
// literal thresholds the guard happens to gate on.
const PAIRS: Array<[string, string]> = [
  ["#8a5a1f", "#ffffff"], // --color-live vs platform light.canvas/surface
  ["#5b6780", "#ffffff"], // --color-ended vs platform light.canvas/surface
  ["#d2a86b", "#0b1220"], // --color-live-on-dark vs platform dark.canvas
  ["#d2a86b", "#111a2c"], // --color-live-on-dark vs platform dark.surface
  ["#8a5a1f", "#8a5a1f"], // identical — exactly 1
  ["#000000", "#ffffff"], // maximal — exactly 21
  ["#fbf5ea", "#f1f3f7"], // two near-whites, close together
  ["#123456", "#654321"],
];

describe("POL-status-contrast-formula-agreement", () => {
  it("public.wcag_contrast_ratio() agrees with contrast.ts's contrastRatio() to two decimal places", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, PROPOSED);
      for (const [a, b] of PAIRS) {
        const sql = await sqlRatio(tx, a, b);
        const ts = contrastRatio(a, b);
        expect(sql, `${a} vs ${b}`).toBeCloseTo(ts, 2);
      }
    });
  });

  it("is symmetric in SQL, same as the TypeScript formula", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, PROPOSED);
      for (const [a, b] of PAIRS) {
        const forward = await sqlRatio(tx, a, b);
        const backward = await sqlRatio(tx, b, a);
        expect(forward).toBeCloseTo(backward, 6);
      }
    });
  });
});
