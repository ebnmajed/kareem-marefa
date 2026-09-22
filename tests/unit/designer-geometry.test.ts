// The studio's pointer geometry — REQ-DSG-028, DEC-096, DEC-178 (W13.1 R1, R2, R5).
//
// ★ The one question every case asks: does a VISUAL gesture write the right
// LOGICAL frame on an RTL page, where `x` is measured from the right? A drag to
// the right is a smaller `x`; the east handle moves the frame's START edge; a
// rotation is not mirrored at all.
import { describe, expect, it } from "vitest";
import {
  boundsOf,
  intersects,
  moveFrame,
  normaliseRotation,
  nudgeLayers,
  resizeFrame,
  rotateFromPointer,
  snapFrame,
  snapTolerance,
  toLogical,
  toPhysical,
  type DesignDocument,
  type Frame,
  type Layer,
} from "@kareem/designer-runtime";

const page = (direction: "rtl" | "ltr") => ({ direction, master: { width: 1080, height: 1350, unit: "px" as const } });
const doc = (direction: "rtl" | "ltr", layers: Layer[] = []): DesignDocument => ({ schemaVersion: 1, purpose: "poster", ...page(direction), layers });
const box = (id: string, frame: Frame): Layer => ({ id, kind: "shape", frame, shape: { type: "rect", fill: "{{brand.surface}}" } }) as Layer;

describe("logical ↔ physical — the one direction switch", () => {
  it("★ on an RTL page x is measured from the RIGHT: physical left = W − x − w", () => {
    expect(toPhysical({ x: 80, y: 100, w: 300, h: 50 }, page("rtl"))).toEqual({ left: 700, top: 100, width: 300, height: 50, rotation: 0 });
    expect(toPhysical({ x: 80, y: 100, w: 300, h: 50 }, page("ltr")).left).toBe(80);
  });

  it("round-trips in both directions, and never invents a rotation key", () => {
    for (const d of ["rtl", "ltr"] as const) {
      const f = { x: 123, y: 45, w: 67, h: 89 };
      expect(toLogical(toPhysical(f, page(d)), page(d), f)).toEqual(f);
      const r = { ...f, rotation: 30 };
      expect(toLogical(toPhysical(r, page(d)), page(d), r)).toEqual(r);
    }
  });
});

describe("move and nudge follow the VISUAL axis (DEC-096)", () => {
  it("★ a drag / → of +10 px is x − 10 on an RTL page and x + 10 on an LTR one", () => {
    expect(moveFrame({ x: 100, y: 100, w: 50, h: 50 }, 10, 5, page("rtl"))).toEqual({ x: 90, y: 105, w: 50, h: 50 });
    expect(moveFrame({ x: 100, y: 100, w: 50, h: 50 }, 10, 5, page("ltr"))).toEqual({ x: 110, y: 105, w: 50, h: 50 });
  });

  it("nudges only the named layers, whole pixels, and a zero nudge is the same object", () => {
    const d = doc("rtl", [box("a", { x: 100, y: 100, w: 50, h: 50 }), box("b", { x: 300, y: 300, w: 50, h: 50 })]);
    const next = nudgeLayers(d, ["a"], 1, 0);
    expect(next.layers[0]?.frame.x).toBe(99);
    expect(next.layers[1]).toBe(d.layers[1]);
    expect(nudgeLayers(d, ["a"], 0, 0)).toBe(d);
  });
});

describe("resize from a handle keeps the opposite side fixed", () => {
  it("★ RTL: the EAST handle dragged right grows w and shrinks x — the start (right) edge moved, the left stayed", () => {
    const f = { x: 100, y: 100, w: 200, h: 100 };
    const next = resizeFrame(f, "e", 20, 0, page("rtl"));
    expect(next).toEqual({ x: 80, y: 100, w: 220, h: 100 });
    // The physical left edge did not move.
    expect(toPhysical(next, page("rtl")).left).toBe(toPhysical(f, page("rtl")).left);
  });

  it("LTR: the west handle dragged left grows w and x moves left", () => {
    expect(resizeFrame({ x: 100, y: 100, w: 200, h: 100 }, "w", -20, 0, page("ltr"))).toEqual({ x: 80, y: 100, w: 220, h: 100 });
  });

  it("the north handle moves y and h; the frame never falls below 1 px", () => {
    expect(resizeFrame({ x: 0, y: 100, w: 10, h: 100 }, "n", 0, -30, page("ltr"))).toEqual({ x: 0, y: 70, w: 10, h: 130 });
    expect(resizeFrame({ x: 0, y: 0, w: 10, h: 10 }, "se", -500, -500, page("ltr"))).toMatchObject({ w: 1, h: 1 });
  });

  it("a corner with keepRatio holds the proportion", () => {
    const next = resizeFrame({ x: 0, y: 0, w: 200, h: 100 }, "se", 100, 0, page("ltr"), { keepRatio: true });
    expect(next.w / next.h).toBeCloseTo(2, 5);
  });

  it("★ a ROTATED layer: the pointer is read along the layer's own axes, and the opposite corner stays put on the page", () => {
    const f = { x: 400, y: 400, w: 200, h: 100, rotation: 90 };
    // Rotated 90° clockwise, the layer's own «east» points DOWN the page: a
    // pointer moving down by 40 grows the width by 40.
    const next = resizeFrame(f, "e", 0, 40, page("ltr"));
    expect(next.w).toBe(240);
    expect(next.h).toBe(100);
    expect(next.rotation).toBe(90);
    const corner = (fr: Frame) => {
      // The layer's own north-west corner, on the page.
      const b = toPhysical(fr, page("ltr"));
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const t = (b.rotation * Math.PI) / 180;
      const [lx, ly] = [-b.width / 2, -b.height / 2];
      return [cx + lx * Math.cos(t) - ly * Math.sin(t), cy + lx * Math.sin(t) + ly * Math.cos(t)];
    };
    const [ax, ay] = corner(f);
    const [bx, by] = corner(next);
    expect(Math.abs(ax - bx)).toBeLessThanOrEqual(1);
    expect(Math.abs(ay - by)).toBeLessThanOrEqual(1);
  });
});

describe("rotation is visual, whole degrees, one stored form", () => {
  it("normalises to (−180, 180] and never stores −0", () => {
    expect(normaliseRotation(190)).toBe(-170);
    expect(normaliseRotation(-180)).toBe(180);
    expect(normaliseRotation(360)).toBe(0);
    expect(Object.is(normaliseRotation(-0.2), -0)).toBe(false);
  });

  it("a quarter turn clockwise around the centre is +90, and shift's 15° step snaps", () => {
    const c = { x: 0, y: 0 };
    expect(rotateFromPointer(c, { x: 10, y: 0 }, { x: 0, y: 10 }, 0)).toBe(90);
    expect(rotateFromPointer(c, { x: 10, y: 0 }, { x: 10, y: 2 }, 0, 15)).toBe(15);
  });
});

describe("the marquee — screen space, touch rule", () => {
  it("a rotated layer's bounds grow to cover its corners, and touching counts", () => {
    const b = boundsOf({ x: 0, y: 0, w: 100, h: 100, rotation: 45 }, page("ltr"));
    expect(b.right - b.left).toBeCloseTo(141.42, 1);
    expect(intersects({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 10, right: 20, bottom: 20 })).toBe(true);
    expect(intersects({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 11, top: 0, right: 20, bottom: 10 })).toBe(false);
  });
});

describe("snap — tolerance in SCREEN pixels, helpers reused (W13.1 R2)", () => {
  it("★ six screen pixels is 13 document px on a poster at 0.45 and 43 on a landscape certificate at 0.139", () => {
    expect(snapTolerance(0.45)).toBe(13);
    expect(snapTolerance(486 / 3508)).toBe(43);
    expect(snapTolerance(1)).toBe(6);
  });

  it("the start edge, the end edge or the centre snaps — whichever is nearest — and names the guide", () => {
    // Master: the safe box starts at 80 and its centre is 540.
    const d = doc("rtl", [box("a", { x: 86, y: 500, w: 100, h: 40 })]);
    const near = snapFrame(d, "a", { x: 86, y: 500, w: 100, h: 40 }, 8);
    expect(near.frame.x).toBe(80);
    expect(near.guides.inline).toEqual([80]);
    const centred = snapFrame(d, "a", { x: 487, y: 500, w: 100, h: 40 }, 8);
    expect(centred.frame.x).toBe(490);
    expect(centred.guides.inline).toEqual([540]);
    const free = snapFrame(d, "a", { x: 300, y: 300, w: 100, h: 40 }, 8);
    expect(free.frame).toMatchObject({ x: 300, y: 300 });
    expect(free.guides).toEqual({ inline: [], block: [] });
  });
});
