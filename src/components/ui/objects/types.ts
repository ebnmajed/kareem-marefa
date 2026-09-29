// The six toy-gloss objects — «ساحة اللعب», REQ-UIX-042, DEC-183 §4.8 – §4.10,
// `docs/design/08-assets.md`.
//
// ★ THEY ARE ARTWORK, NOT PRIMITIVES, AND THEY ARE DECORATION. An object is
// `aria-hidden`: what it means is in the text beside it. It is never a status,
// and a glyph (`ui/icons`) never stands in for one in a celebration.
//
// ★ INLINE SVG LIVES IN `src/` AND NOWHERE ELSE. No SVG reaches the designer or
// an `<img>` served from user storage (DEC-009, invariant 11). A poster layer is
// a raster, and that is a later wave's (DEC-187).
//
// They hold hex: a gradient stop is a colour. `tests/unit/tokens-only` exempts
// this directory by name and no other.

export interface ObjectProps {
  /** Pixels, square. The masters are drawn on a 160 grid. */
  size?: number;
  /** The soft contact shadow. Off when the object sits on a coloured ground. */
  shadow?: boolean;
  className?: string;
}
