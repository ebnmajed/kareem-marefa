"use client";

import type { BlockLibraryProps } from "@/components/ui";

// The email builder's grid of blocks or of row layouts — REQ-UIX-112, REQ-NTF-015, DEC-093. `notify`'s.
//
// ★ A TAP ARMS, A SLOT PLACES (DEC-093). The artboard draws a block dragged into the email («سحب إلى المسودة»); SC 2.5.7
// requires a way that is not a drag, and a keyboard path does not discharge it. So a tile is a toggle button: a tap arms
// it (`aria-pressed`), the canvas then shows its «أضف هنا» slots, and a tap on a slot places it — one pointer, no
// movement. A tap on the armed tile disarms. The drag is the enhancement and exists only when the caller passes
// `onDragStart`; every tile does the same thing with or without it.
//
// It reads no catalogue and knows nothing of mail: the caller hands it the words, the glyphs and the weights. A layout
// tile draws its columns from `weights` — plain boxes, no picture. No motion (`REQ-UIX-053`): pressed is a border, not a
// transition.

export function BlockLibrary({ label, items, variant = "blocks", armed, onArm, onDragStart, onDragEnd, className = "" }: BlockLibraryProps) {
  const layouts = variant === "layouts";
  return (
    <div role="group" aria-label={label} data-slot="block-library" className={`grid gap-2 ${layouts ? "grid-cols-2" : "grid-cols-3"} ${className}`}>
      {items.map((item) => {
        const pressed = armed === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={pressed}
            draggable={onDragStart ? true : undefined}
            onDragStart={onDragStart ? (event) => onDragStart(item.key, event) : undefined}
            onDragEnd={onDragEnd}
            onClick={() => onArm(pressed ? null : item.key)}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1.5 rounded-field border bg-raised p-2 text-label text-fg-heading hover:bg-hover ${
              pressed ? "border-accent" : "border-edge"
            }`}
          >
            {layouts ? (
              <span aria-hidden="true" data-layout-schematic="" className="flex h-7 w-full gap-1">
                {(item.weights ?? [1]).map((weight, index) => (
                  <span key={index} className="rounded-sm bg-edge" style={{ flexGrow: weight, flexBasis: 0 }} />
                ))}
              </span>
            ) : item.glyph ? (
              <span aria-hidden="true" className="text-fg-muted">
                {item.glyph}
              </span>
            ) : null}
            {/* A layout's name is its accessible text; the schematic says the same thing to the eye. */}
            <span className={layouts ? "sr-only" : "text-center"}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
