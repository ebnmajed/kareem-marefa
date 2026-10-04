import { readDocument, readRows, readStyles, SCHEMA_VERSION, type DroppedBlock, type EmailBlock, type EmailBlockDocument, type EmailRow, type EmailStyles, type RowLayout } from "@kareem/mail-runtime";
import { newId } from "@/components/email/document";

// The email builder's document and every operation on it — pure, so each rule is a unit test and the screen is only
// its rendering (wave 23, REQ-UIX-112, REQ-NTF-015, DEC-093).
//
// ★ THE EDITOR HOLDS ROWS; THE STORED DOCUMENT HOLDS A FLAT LIST. Inside, every block sits in a row (a one-column row
// holds one block). `toDocument()` writes `blocks` in reading order and writes `rows` ONLY when some row has columns,
// `styles` only when one is set — so a design opened and saved without a multi-column row is stored as the very JSON
// it was, and the 120 pinned messages stay what they are (`REQ-NTF-015`: «a document saved before the change opens and
// compiles unchanged»).
//
// ★ EVERY MOVE HAS A PATH THAT IS NOT A DRAG (DEC-093). `moveStep` is ▲▼; `place` puts an ARMED thing — a new block,
// a new layout, or an existing row or block picked up by «انقل» — at a slot. The drag, where offered, calls the same
// `place`. Nothing here knows a pointer exists.

export interface BuilderRow {
  id: string;
  layout: RowLayout;
  /** A `"1"` row has one column; its blocks are listed in order (one, unless the admin placed more). */
  columns: string[][];
}

export interface BuilderDoc {
  rows: BuilderRow[];
  blocks: Record<string, EmailBlock>;
  styles: EmailStyles;
}

/** Where a slot puts what is armed — `BlockCanvasPlace`'s shape. */
export type Place = { index: number } | { rowId: string; column: number; index: number };

/** What a tap in the library or «انقل» picked up. */
export type Armed = { kind: "block"; block: EmailBlock } | { kind: "layout"; layout: RowLayout } | { kind: "move"; id: string };

const WEIGHTS: Record<RowLayout, number> = { "1": 1, "1/1": 2, "1/2": 2, "1/1/1": 3 };

export function fromDocument(value: unknown): { doc: BuilderDoc; dropped: DroppedBlock[] } {
  const { blocks, dropped } = readDocument(value);
  const layout = readRows(value, blocks);
  const rows: BuilderRow[] = (layout ?? blocks.map((block) => ({ kind: "single" as const, block }))).map((entry) =>
    entry.kind === "single"
      ? { id: `r-${entry.block.id}`, layout: "1", columns: [[entry.block.id]] }
      : { id: entry.id || `r-${newId()}`, layout: entry.layout, columns: entry.columns.map((column) => column.map((block) => block.id)) },
  );
  return { doc: { rows, blocks: Object.fromEntries(blocks.map((block) => [block.id, block])), styles: readStyles(value) ?? {} }, dropped };
}

/** The document as stored — flat `blocks` in reading order, `rows` and `styles` only when they say something. */
export function toDocument(doc: BuilderDoc): EmailBlockDocument {
  const ordered = doc.rows.flatMap((row) => row.columns.flat()).map((id) => doc.blocks[id]).filter((block): block is EmailBlock => Boolean(block));
  const document: EmailBlockDocument = { schemaVersion: SCHEMA_VERSION, blocks: ordered };
  if (doc.rows.some((row) => row.layout !== "1")) {
    document.rows = doc.rows.flatMap((row): EmailRow[] =>
      row.layout === "1" ? row.columns[0]!.map((id) => ({ id: `r-${id}`, layout: "1", columns: [[id]] })) : [{ id: row.id, layout: row.layout, columns: row.columns.map((c) => [...c]) }],
    );
  }
  if (Object.keys(doc.styles).length > 0) document.styles = doc.styles;
  return document;
}

/** The string the save posts and every «unsaved?» comparison reads — `documentJsonOf()`'s, for a flat document. */
export function documentJson(doc: BuilderDoc): string {
  const document = toDocument(doc);
  return document.blocks.length > 0 ? JSON.stringify(document) : "";
}

// ── Where things are ──────────────────────────────────────────────────────────

/** A one-column row is selected by its block's id (the frame names it so); a multi-column row by its own. */
export function targetIdOf(row: BuilderRow): string {
  return row.layout === "1" && row.columns[0]!.length === 1 ? row.columns[0]![0]! : row.id;
}

function locate(doc: BuilderDoc, id: string): { row: number; column?: number; index?: number } | null {
  for (let r = 0; r < doc.rows.length; r++) {
    const row = doc.rows[r]!;
    if (targetIdOf(row) === id) return { row: r };
    for (let c = 0; c < row.columns.length; c++) {
      const i = row.columns[c]!.indexOf(id);
      if (i >= 0) return { row: r, column: c, index: i };
    }
  }
  return null;
}

const clone = (doc: BuilderDoc): BuilderDoc => ({ rows: doc.rows.map((row) => ({ ...row, columns: row.columns.map((c) => [...c]) })), blocks: { ...doc.blocks }, styles: doc.styles });

/** Rows with nothing in them go; a one-column row that lost its block goes with it. */
function tidy(doc: BuilderDoc): BuilderDoc {
  return { ...doc, rows: doc.rows.filter((row) => (row.layout === "1" ? row.columns[0]!.length > 0 : true)) };
}

// ── The operations ────────────────────────────────────────────────────────────

export function emptyRow(layout: RowLayout): BuilderRow {
  return { id: `r-${newId()}`, layout, columns: Array.from({ length: WEIGHTS[layout] }, () => []) };
}

function insertBlockId(doc: BuilderDoc, id: string, place: Place): BuilderDoc {
  const next = clone(doc);
  if ("rowId" in place) {
    const row = next.rows.find((r) => r.id === place.rowId);
    const column = row?.columns[place.column];
    if (!row || !column) return doc;
    column.splice(Math.min(Math.max(place.index, 0), column.length), 0, id);
    return next;
  }
  next.rows.splice(Math.min(Math.max(place.index, 0), next.rows.length), 0, { id: `r-${id}`, layout: "1", columns: [[id]] });
  return next;
}

/** Puts what is armed at a slot. Returns the new document and the id to select. */
export function place(doc: BuilderDoc, armed: Armed, at: Place): { doc: BuilderDoc; select: string | null } {
  if (armed.kind === "block") {
    const withBlock = { ...doc, blocks: { ...doc.blocks, [armed.block.id]: armed.block } };
    return { doc: insertBlockId(withBlock, armed.block.id, at), select: armed.block.id };
  }
  if (armed.kind === "layout") {
    if ("rowId" in at) return { doc, select: null };
    const next = clone(doc);
    const row = emptyRow(armed.layout);
    next.rows.splice(Math.min(Math.max(at.index, 0), next.rows.length), 0, row);
    return { doc: next, select: null };
  }
  // A move: take it out, then put it where the slot says — the index measured BEFORE the removal.
  const from = locate(doc, armed.id);
  if (!from) return { doc, select: null };
  const isWholeRow = from.column === undefined;
  if (isWholeRow) {
    if ("rowId" in at) {
      // A one-column row's block may go into a column; a multi-column row may not nest.
      const row = doc.rows[from.row]!;
      if (row.layout !== "1") return { doc, select: armed.id };
      const removed = clone(doc);
      removed.rows.splice(from.row, 1);
      return { doc: insertBlockId(removed, armed.id, at), select: armed.id };
    }
    const next = clone(doc);
    const [row] = next.rows.splice(from.row, 1);
    const index = at.index > from.row ? at.index - 1 : at.index;
    next.rows.splice(Math.min(Math.max(index, 0), next.rows.length), 0, row!);
    return { doc: next, select: armed.id };
  }
  const removed = clone(doc);
  removed.rows[from.row]!.columns[from.column!]!.splice(from.index!, 1);
  let target = at;
  if ("rowId" in at && at.rowId === doc.rows[from.row]!.id && at.column === from.column && at.index > from.index!) target = { ...at, index: at.index - 1 };
  return { doc: tidy(insertBlockId(removed, armed.id, target)), select: armed.id };
}

/** ▲ / ▼ — one step: a row among rows, a block within its column. */
export function moveStep(doc: BuilderDoc, id: string, direction: "up" | "down"): BuilderDoc {
  const at = locate(doc, id);
  if (!at) return doc;
  const delta = direction === "up" ? -1 : 1;
  const next = clone(doc);
  if (at.column === undefined) {
    const to = at.row + delta;
    if (to < 0 || to >= next.rows.length) return doc;
    [next.rows[at.row], next.rows[to]] = [next.rows[to]!, next.rows[at.row]!];
    return next;
  }
  const column = next.rows[at.row]!.columns[at.column]!;
  const to = at.index! + delta;
  if (to < 0 || to >= column.length) return doc;
  [column[at.index!], column[to]] = [column[to]!, column[at.index!]!];
  return next;
}

function copyBlock(block: EmailBlock): EmailBlock {
  return { ...structuredClone(block), id: newId() };
}

/** ⧉ — a copy right after the original: a row after its row, a block after itself in its column. */
export function duplicate(doc: BuilderDoc, id: string): { doc: BuilderDoc; select: string } {
  const at = locate(doc, id);
  if (!at) return { doc, select: id };
  const next = clone(doc);
  if (at.column === undefined) {
    const row = next.rows[at.row]!;
    const ids = new Map<string, string>();
    const columns = row.columns.map((column) =>
      column.map((blockId) => {
        const copy = copyBlock(doc.blocks[blockId]!);
        next.blocks[copy.id] = copy;
        ids.set(blockId, copy.id);
        return copy.id;
      }),
    );
    const copyRow: BuilderRow = { id: `r-${newId()}`, layout: row.layout, columns };
    next.rows.splice(at.row + 1, 0, copyRow);
    return { doc: next, select: targetIdOf(copyRow) };
  }
  const copy = copyBlock(doc.blocks[id]!);
  next.blocks[copy.id] = copy;
  next.rows[at.row]!.columns[at.column]!.splice(at.index! + 1, 0, copy.id);
  return { doc: next, select: copy.id };
}

/** 🗑 — a row with everything in it, or one block. */
export function remove(doc: BuilderDoc, id: string): BuilderDoc {
  const at = locate(doc, id);
  if (!at) return doc;
  const next = clone(doc);
  if (at.column === undefined) {
    const [row] = next.rows.splice(at.row, 1);
    for (const blockId of row!.columns.flat()) delete next.blocks[blockId];
    return next;
  }
  next.rows[at.row]!.columns[at.column]!.splice(at.index!, 1);
  delete next.blocks[id];
  return tidy(next);
}

export function updateBlock(doc: BuilderDoc, id: string, block: EmailBlock): BuilderDoc {
  if (!doc.blocks[id]) return doc;
  return { ...doc, blocks: { ...doc.blocks, [id]: { ...block, id } } };
}

export function setStyles(doc: BuilderDoc, styles: EmailStyles): BuilderDoc {
  return { ...doc, styles };
}

/** The block a target id names, when it names one block (a multi-column row names none). */
export function blockOf(doc: BuilderDoc, id: string | null): EmailBlock | null {
  return id ? (doc.blocks[id] ?? null) : null;
}

export function rowOf(doc: BuilderDoc, id: string | null): BuilderRow | null {
  return id ? (doc.rows.find((row) => row.id === id && targetIdOf(row) === id) ?? null) : null;
}

export function blockList(doc: BuilderDoc): EmailBlock[] {
  return toDocument(doc).blocks;
}

// ── History: fifty steps, one per commit (06 §10's rule, the designer's number) ──

export interface History {
  past: BuilderDoc[];
  present: BuilderDoc;
  future: BuilderDoc[];
}

export const HISTORY_LIMIT = 50;

export function commit(history: History, next: BuilderDoc): History {
  if (next === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const following = history.future[0];
  if (!following) return history;
  return { past: [...history.past, history.present], present: following, future: history.future.slice(1) };
}
