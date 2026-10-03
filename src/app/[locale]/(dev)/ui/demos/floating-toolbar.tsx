"use client";

import { FloatingToolbar } from "@/components/ui/floating-toolbar";

// `floating-toolbar`'s gallery entry — REQ-UIX-107, DEC-237. Literals only: the five controls a text layer is touched
// for most, above a selected box, and the same bar flipped below a box at the top of its stage.

const CONTROLS = ["Baloo 800", "40", "A", "المحاذاة", "{ } ربط"];

function Stage({ top, title }: { top: number; title: string }) {
  const anchor = { left: 24, top, width: 280, height: 56 };
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      <div className="relative h-48 w-full max-w-[22rem] rounded-panel border border-edge bg-surface">
        <span aria-hidden="true" className="absolute border border-accent" style={{ left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height }} />
        <FloatingToolbar label="تنسيق النص" anchor={anchor}>
          {CONTROLS.map((c) => (
            <button key={c} type="button" className="min-h-8 rounded-field px-2 hover:bg-hover">
              <bdi>{c}</bdi>
            </button>
          ))}
        </FloatingToolbar>
      </div>
    </figure>
  );
}

export function FloatingToolbarDemo() {
  return (
    <div className="flex flex-wrap gap-6">
      <Stage top={100} title="فوق التحديد" />
      <Stage top={16} title="تحت التحديد — لا مكان فوقه" />
    </div>
  );
}
