"use client";

import { useState } from "react";
import { CanvasStage } from "@/components/ui/canvas-stage";

// `canvas-stage`'s gallery entry — REQ-UIX-110, DEC-237 §3. Literals only: a 4:5 sheet fitted on the stage with the
// rulers counting from the RIGHT (an Arabic document's start edge, DEC-096), the grid and the toggles drawn on the
// canvas. The child is a plain box — the stage draws nothing of a document. Wrapped in its own scroller so a 390 px
// gallery never scrolls sideways.

export function CanvasStageDemo() {
  const [grid, setGrid] = useState(true);
  const [rulers, setRulers] = useState(true);
  const [scale, setScale] = useState(1);
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">
        مسرح اللوحة · <bdi dir="ltr">{Math.round(scale * 100)}%</bdi>
      </figcaption>
      <div className="overflow-x-auto">
        <CanvasStage
          label="اللوحة"
          contentWidth={1080}
          contentHeight={1350}
          zoom="fit"
          onScaleChange={setScale}
          rulers={rulers ? { direction: "rtl", step: 270 } : null}
          grid={grid ? { step: 135 } : null}
          toggles={[
            { key: "grid", label: "الشبكة", pressed: grid, onPressedChange: setGrid },
            { key: "rulers", label: "المساطر", pressed: rulers, onPressedChange: setRulers },
          ]}
          className="h-96 w-full max-w-[22rem] rounded-panel border border-edge"
        >
          {(s) => <div className="rounded-field bg-surface" style={{ width: 1080 * s, height: 1350 * s }} />}
        </CanvasStage>
      </div>
    </figure>
  );
}
