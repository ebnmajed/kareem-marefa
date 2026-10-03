import type { AlignAxis, AlignEdge, AlignTarget, DesignDocument, FocalPoint, GroupAlignTarget, ReorderMove } from "@kareem/designer-runtime";

// SCR-057's inspector arithmetic — REQ-DSG-005, REQ-DSG-021, REQ-DSG-028,
// REQ-DSG-030, DEC-093, DEC-096, DEC-127, DEC-237 §2.
//
// MOVED VERBATIM out of `inspector.tsx` (wave 23, slice 1): the op types the
// editor and two suites import, the brand-token mapping (a colour is a TOKEN,
// never a hex — REQ-DSG-021), the background switch, the focal grid's names
// and tolerance. Pure; nothing here reads the console's direction (DEC-096).

export type ArrangeOp =
  | { kind: "align"; axis: AlignAxis; edge: AlignEdge; target: AlignTarget }
  | { kind: "fit" }
  | { kind: "order"; move: ReorderMove };

/** Two or more layers at once (wave 13) — on the DOCUMENT's axis, like one. */
export type GroupOp = { kind: "align"; axis: AlignAxis; edge: AlignEdge; target: GroupAlignTarget } | { kind: "distribute"; axis: AlignAxis };

/** The taps for rotate, resize and move (DEC-093): ±15°, «صفّر», «املأ عرضًا», «ضع بنقرة». */
export type TransformOp = { kind: "rotate"; degrees: number; mode: "by" | "to" } | { kind: "fillWidth" } | { kind: "place" };

export const token = (value: string | undefined): string | null => /^\{\{\s*brand\.([A-Za-z]+)\s*\}\}$/.exec(value ?? "")?.[1] ?? null;
export const bind = (name: string) => `{{brand.${name}}}`;

/** The background after choosing «solid» or «gradient» — `null` when nothing changes. */
export function nextBackground(doc: DesignDocument, type: string): DesignDocument | null {
  const bg = doc.background ?? { type: "solid" as const, color: bind("canvas") };
  if (type === bg.type) return null;
  if (type === "gradient") {
    const from = bg.type === "solid" ? bg.color : bind("surface");
    return { ...doc, background: { type: "gradient", angle: 140, stops: [{ color: from }, { color: bind("canvasRaise") }] } };
  } else {
    const first = bg.type === "gradient" ? (bg.stops[0]?.color ?? bind("canvas")) : bind("canvas");
    return { ...doc, background: { type: "solid", color: first } };
  }
}

export const FOCAL_NAMES = ["topLeft", "top", "topRight", "left", "centre", "right", "bottomLeft", "bottom", "bottomRight"] as const;

/** Whether a grid point is the current focal point. */
export const focalChecked = (point: FocalPoint, p: FocalPoint): boolean => Math.abs(point.x - p.x) < 0.005 && Math.abs(point.y - p.y) < 0.005;
