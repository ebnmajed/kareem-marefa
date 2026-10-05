// The org seed is a copy of the library, and renders as the library renders — REQ-DSG-035, DEC-254 §3.6, DEC-176.
//
// `designer-library.test.ts` deep-equals the seed's documents against the library. This file holds the rest of what
// «no parity golden moves» needs from the SQL side: the file is the shape the lead promotes (one function, eleven
// compositions, owner-only), and every document in it produces the SAME HTML through the one renderer as the library
// object it was generated from.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASELINE_LIBRARY, renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

function seedFile(): string {
  const proposed = join(process.cwd(), "supabase", "proposed", "designer", "0007_seed_org_templates.sql");
  if (existsSync(proposed)) return readFileSync(proposed, "utf8");
  const dir = join(process.cwd(), "supabase", "migrations");
  const promoted = readdirSync(dir)
    .filter((f) => /_seed_org_templates\.sql$/.test(f))
    .sort()
    .at(-1);
  if (!promoted) throw new Error("the org seed is neither under supabase/proposed/designer/ nor promoted");
  return readFileSync(join(dir, promoted), "utf8");
}

const sql = seedFile();
const blocks = [...sql.matchAll(/--\s*@family\s+(\S+)[\s\S]*?\$json\$([\s\S]*?)\$json\$::jsonb;/g)].map((m) => ({
  marker: m[1] as string,
  document: JSON.parse(m[2] as string) as DesignDocument,
}));
const keyOf = (t: (typeof BASELINE_LIBRARY)[number]) =>
  t.purpose === "poster" ? `${t.family}@v${t.version}` : `${t.family}@${t.orientation}@v${t.version}`;

describe("the org seed's file", () => {
  it("is ONE owner-only function — no platform row, no do-block, no grant", () => {
    expect(sql.match(/create or replace function public\.seed_org_templates\(p_org uuid\)/g)).toHaveLength(1);
    expect(sql).toMatch(/security definer set search_path = ''/);
    expect(sql).toMatch(/revoke execute on function public\.seed_org_templates\(uuid\) from public, anon, authenticated, service_role;/);
    expect(sql).not.toMatch(/\bgrant\s+execute/i);
    expect(sql).not.toMatch(/'platform'/);
    expect(sql).not.toMatch(/^do \$\$/m);
  });

  it("★ carries the eleven compositions, each once, in the library's order", () => {
    expect(blocks.map((b) => b.marker)).toEqual(BASELINE_LIBRARY.map(keyOf));
  });

  it("★ every row it inserts is the org's own version 1, published", () => {
    expect(sql.match(/values \(v_template, 1, v_doc, v_fields, '\{\}', now\(\)\);/g)).toHaveLength(11);
    expect(sql.match(/p_org, 'org', /g)).toHaveLength(11);
  });

  it("★★ every document renders to the SAME HTML as the library object it came from — no golden can move", () => {
    const opts = { fonts: [], bindings: { values: {} } };
    for (const t of BASELINE_LIBRARY) {
      const block = blocks.find((b) => b.marker === keyOf(t));
      expect(renderDocumentToHtml(block!.document, opts), keyOf(t)).toBe(renderDocumentToHtml(t.document, opts));
    }
  });
});
