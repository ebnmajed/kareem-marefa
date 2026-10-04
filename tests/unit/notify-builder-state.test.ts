// The email builder's document operations — wave 23, REQ-UIX-112, REQ-NTF-015, DEC-093. Pure, so every rule the
// canvas leans on is proven here: what is stored, where a slot puts what is armed, ▲▼, duplicate, delete, history.
import { describe, expect, it } from "vitest";
import { DESIGN_FOR, platformDesign, type EmailBlock } from "@kareem/mail-runtime";
import { documentJsonOf } from "@/components/email/document";
import {
  commit,
  documentJson,
  duplicate,
  fromDocument,
  HISTORY_LIMIT,
  moveStep,
  place,
  redo,
  remove,
  toDocument,
  undo,
  type BuilderDoc,
} from "@/components/email/builder-state";

const p = (id: string, text = id): EmailBlock => ({ type: "paragraph", id, text });
const flat = (...blocks: EmailBlock[]) => fromDocument({ schemaVersion: 1, blocks }).doc;
const order = (doc: BuilderDoc) => toDocument(doc).blocks.map((b) => b.id);

describe("★ what is stored — a design opened and saved unchanged is the JSON it was", () => {
  it.each(Object.keys(DESIGN_FOR))("%s", (key) => {
    const design = platformDesign(key)!;
    const { doc, dropped } = fromDocument(design);
    expect(dropped).toEqual([]);
    // ★ THE WHOLE DOCUMENT, AND BY VALUE RATHER THAN BY STRING (wave 24,
    // `REQ-NTF-016`).
    //
    // It was `toBe(documentJsonOf(design.blocks))` — blocks alone — which held
    // only while no platform design carried `styles`. Widening it to
    // `JSON.stringify(design)` then failed on KEY ORDER and nothing else:
    // `readStyles()` rebuilds the object in its own order, so the round trip was
    // byte-different and semantically perfect.
    //
    // ★ And key order is not a property of anything. The string that must be
    // stable is the one the editor compares — and it compares
    // `documentJson(current)` against `documentJson(initial)`, BOTH through
    // `fromDocument()`, so an admin opening a platform design does not see
    // «unsaved» (`builder.tsx:151`). That is asserted below as idempotency,
    // which is the real invariant; this line asserts the document survives.
    expect(JSON.parse(documentJson(doc))).toEqual(design);
  });

  it.each(Object.keys(DESIGN_FOR))("%s — and the stored string is stable through a second round trip", (key) => {
    // ★ The property `builder.tsx` leans on: the baseline it compares against is
    // `documentJson(fromDocument(…).doc)`, so a second pass must produce the
    // same string or every design would open dirty.
    const once = documentJson(fromDocument(platformDesign(key)!).doc);
    const twice = documentJson(fromDocument(JSON.parse(once)).doc);
    expect(twice).toBe(once);
  });

  it("a multi-column row writes `rows`; styles are written only when set", () => {
    const { doc } = place(flat(p("a")), { kind: "layout", layout: "1/2" }, { index: 1 });
    const rowId = doc.rows[1]!.id;
    const filled = place(doc, { kind: "block", block: p("b") }, { rowId, column: 1, index: 0 }).doc;
    const stored = toDocument(filled);
    expect(stored.rows).toEqual([
      { id: "r-a", layout: "1", columns: [["a"]] },
      { id: rowId, layout: "1/2", columns: [[], ["b"]] },
    ]);
    expect(stored.styles).toBeUndefined();
    expect(toDocument({ ...filled, styles: { padding: 32 } }).styles).toEqual({ padding: 32 });
  });

  it("a stored overlay reads back into the same rows", () => {
    const stored = { schemaVersion: 1, blocks: [p("a"), p("b"), p("c")], rows: [{ id: "x", layout: "1/1", columns: [["a"], ["b"]] }, { id: "r-c", layout: "1", columns: [["c"]] }] };
    expect(toDocument(fromDocument(stored).doc)).toEqual(stored);
  });
});

describe("★ placing what is armed — the tap path every drag shares (DEC-093)", () => {
  it("a new block between rows becomes its own row, and is selected", () => {
    const result = place(flat(p("a"), p("c")), { kind: "block", block: p("b") }, { index: 1 });
    expect(order(result.doc)).toEqual(["a", "b", "c"]);
    expect(result.select).toBe("b");
  });

  it("«انقل» a row down past its neighbour — the slot's index is read before the removal", () => {
    const result = place(flat(p("a"), p("b"), p("c")), { kind: "move", id: "a" }, { index: 3 });
    expect(order(result.doc)).toEqual(["b", "c", "a"]);
  });

  it("«انقل» a one-column row into a column, and back out", () => {
    const withRow = place(flat(p("a"), p("b")), { kind: "layout", layout: "1/1" }, { index: 2 }).doc;
    const rowId = withRow.rows[2]!.id;
    const into = place(withRow, { kind: "move", id: "a" }, { rowId, column: 0, index: 0 }).doc;
    expect(into.rows.map((r) => r.id)).toEqual(["r-b", rowId]);
    expect(into.rows[1]!.columns).toEqual([["a"], []]);
    const out = place(into, { kind: "move", id: "a" }, { index: 0 }).doc;
    expect(order(out)).toEqual(["a", "b"]);
    expect(out.rows[2]!.columns).toEqual([[], []]);
  });

  it("a multi-column row never nests inside a column", () => {
    const doc = place(flat(p("a")), { kind: "layout", layout: "1/1" }, { index: 1 }).doc;
    const rowId = doc.rows[1]!.id;
    expect(place(doc, { kind: "move", id: rowId }, { rowId, column: 0, index: 0 }).doc).toBe(doc);
  });
});

describe("▲▼, duplicate, delete", () => {
  it("▲▼ move a row one step and refuse past the ends", () => {
    const doc = flat(p("a"), p("b"));
    expect(order(moveStep(doc, "b", "up"))).toEqual(["b", "a"]);
    expect(moveStep(doc, "a", "up")).toBe(doc);
  });

  it("▲▼ move a block within its column", () => {
    let doc = place(flat(), { kind: "layout", layout: "1/1" }, { index: 0 }).doc;
    const rowId = doc.rows[0]!.id;
    doc = place(doc, { kind: "block", block: p("x") }, { rowId, column: 0, index: 0 }).doc;
    doc = place(doc, { kind: "block", block: p("y") }, { rowId, column: 0, index: 1 }).doc;
    expect(moveStep(doc, "y", "up").rows[0]!.columns[0]).toEqual(["y", "x"]);
  });

  it("duplicate puts a copy with a fresh id right after the original", () => {
    const result = duplicate(flat(p("a", "نص"), p("b")), "a");
    const ids = order(result.doc);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe("a");
    expect(ids[1]).toBe(result.select);
    expect(result.doc.blocks[result.select]).toMatchObject({ type: "paragraph", text: "نص" });
  });

  it("delete removes the row and every block in it", () => {
    let doc = place(flat(p("a")), { kind: "layout", layout: "1/1" }, { index: 1 }).doc;
    const rowId = doc.rows[1]!.id;
    doc = place(doc, { kind: "block", block: p("x") }, { rowId, column: 1, index: 0 }).doc;
    const gone = remove(doc, rowId);
    expect(order(gone)).toEqual(["a"]);
    expect(gone.blocks.x).toBeUndefined();
  });
});

describe("history — one step per commit, fifty at most", () => {
  it("undo and redo walk the commits", () => {
    const a = flat(p("a"));
    const b = flat(p("a"), p("b"));
    let h = { past: [], present: a, future: [] } as { past: BuilderDoc[]; present: BuilderDoc; future: BuilderDoc[] };
    h = commit(h, b);
    expect(undo(h).present).toBe(a);
    expect(redo(undo(h)).present).toBe(b);
  });

  it("keeps the last fifty", () => {
    let h = { past: [] as BuilderDoc[], present: flat(), future: [] as BuilderDoc[] };
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = commit(h, flat(p(`b${i}`)));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
