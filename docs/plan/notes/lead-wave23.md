# Wave 23 — the lead's note

Day one, 2026-10-03. Contract 1 (the studio frame) and contract 2 (the shared chrome's props), published before the
plans so `designer` and `notify` plan against them. **Types land in `ui/index.ts` after sync 1**; a change you need is a
written request in your note, answered here.

## Contract 1 — the studio frame

- **No URL moves.** `src/components/shell/console-frame.tsx` (a client component, the lead's) reads `usePathname()` —
  known during the server render, so there is no flash — and renders **bare** for the editor routes:
  `/app/admin/designer/**` and **the email editor's route, whatever `notify`'s plan names** (`/app/admin/emails/[key]`
  is the expected shape; it enters `04` at sync 1, `DEC-083`). Bare means: no 52 px console bar, no admin rail, no sheet;
  the page owns the whole viewport and draws **its own bar**. `#main` and the skip link stay.
- **Everything else stays framed**: `055` (both tabs), `045` (inside the hub), the email gallery.
- **The layout still never gates** (wave 6). Each editor page's own check at the data stays the boundary.
- The editor's bar is the page's, not a primitive: back · name · state · undo/redo · (strip / device) · zoom · preview ·
  primary. Two editors share its *shape* by contract, not by a file.

## Contract 2 — `ui/editor-rail`

The 68 px icon rail at the inline-start and the 300 px panel beside it that swaps with the rail's selection
(`DEC-NEXT-36`). **A vertical tablist and one tabpanel** — the selection is a tab, not a link; `#hash` links in the
artboard are the board's, not ours.

```ts
export type EditorRailGlyph =
  | "elements" | "fields" | "uploads" | "brand" | "layers" | "checks" | "layer"   // the designer
  | "add" | "styles" | "layouts" | "block";                                        // the email builder

export interface EditorRailItem {
  key: string;
  label: string;                 // 10 px under the glyph; also the panel's heading
  glyph: EditorRailGlyph;        // plain data — the glyphs live in the lead's `src/components/studio/glyphs.tsx`
  /** A count on the item — الفحوصات's findings. Never drawn at 0. `label` is the pluralised accessible text. */
  count?: { value: number; label: string };
  /** An item that exists only with a selection (الطبقة, الكتلة): omit it from `items` when there is none. */
}

export interface EditorRailProps {
  label: string;                 // the tablist's accessible name
  items: EditorRailItem[];
  selected: string;              // controlled
  onSelect: (key: string) => void;
  /** The selected item's panel. The rail draws the heading from the item's label; the panel draws the rest. */
  children: React.ReactNode;
  /** Optional row under the heading — e.g. النص / الموضع / التأثيرات. Composed from `ui/tabs` by the caller. */
  panelTabs?: React.ReactNode;
  className?: string;
}
```

- **Single tap selects** (SC 2.5.7 is not engaged — nothing drags here); ↑/↓ move between tabs, Home/End jump, the
  roving tabindex is the rail's. A selected item stays selected when its panel changes underneath it.
- The panel is 300 px, scrolls on its own, and **never clips a text line** (no `overflow: hidden` on text).
- When an item that exists only with a selection disappears (the selection was cleared), the rail falls back to the
  caller's choice — `onSelect` is called with the caller's fallback, never silently.
- **No motion**: no transition on the swap, no hover scale (`REQ-UIX-053`). Semantic tokens only.

## Contract 2 — `ui/floating-toolbar`

The bar above the selection that holds the five things touched most.

```ts
export interface FloatingToolbarProps {
  label: string;                 // role="toolbar"'s accessible name
  /** The target's box in px, relative to the positioned ancestor the caller provides — the stage's overlay. Physical
   *  `left`/`top`, because it follows document geometry (`DEC-096`'s exemption, written where it is used). */
  anchor: { left: number; top: number; width: number; height: number };
  /** Above the target; flipped below when there is no room above inside the ancestor. */
  placement?: "above" | "below";
  children: React.ReactNode;     // the controls — buttons, menus, a select; each with its own accessible name
  className?: string;
}
```

- `role="toolbar"`; ←/→ move between controls **on the visual axis** (`DEC-096`: arrow keys follow what the eye sees),
  Home/End jump; Tab leaves the toolbar. Each control is a ≥ 24 px target (SC 2.5.8).
- **It never takes focus on its own** when a selection changes — focus stays where the person put it.
- It draws nothing of the document and computes no geometry: the caller hands it the box.
- **No motion.**

## The glyphs

`src/components/studio/glyphs.tsx` (the lead's): the eleven rail glyphs above as inline, `aria-hidden` SVG paths our
code draws — **not** `ui/icons.tsx`, which the five public routes import and whose every change needs the four-part
proof (`DEC-186` §1). Inline SVG we draw is not an upload (invariant 11 is about bytes a person sends).

## The order

1. Sync 1 approves the three plans.
2. The lead cuts `../kareem-marefa-wave23b` from A's head, lands contract 1 and the two primitives there **first**
   (floor 63 → 65 with them; 65 → 67 when `designer`'s two land), and posts «the frame is in at `<sha>`».
3. The lead cuts `../kareem-marefa-wave23c` from B's head at that commit; `notify` builds there (floor 67 → 69).
