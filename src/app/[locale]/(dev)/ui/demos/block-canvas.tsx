"use client";

import { useState } from "react";
import { BlockCanvas } from "@/components/ui/block-canvas";

// `block-canvas`'s gallery entry — REQ-UIX-112, DEC-237 §3, DEC-093. Literals only: a stand-in for the renderer's frame
// (plain boxes at the heights the boxes name — the primitive draws nothing of a mail), one row of two columns, the
// fixed footer. A tap selects; «انقل» arms the selection and the slots place it. Wrapped in its own scroller, so a
// 390 px gallery never scrolls sideways.

const ROWS = [
  { id: "h", label: "عنوان", box: { left: 0, top: 0, width: 600, height: 64 } },
  {
    id: "row",
    label: "تخطيط 1/2",
    box: { left: 0, top: 64, width: 600, height: 112 },
    cells: [
      { box: { left: 404, top: 64, width: 196, height: 112 }, blocks: [{ id: "p", label: "فقرة", box: { left: 404, top: 64, width: 196, height: 112 } }] },
      { box: { left: 0, top: 64, width: 396, height: 112 }, blocks: [] },
    ],
  },
  { id: "b", label: "زر", box: { left: 0, top: 176, width: 600, height: 72 } },
];
const LABELS = { moveUp: "انقل لأعلى", moveDown: "انقل لأسفل", move: "انقل", duplicate: "كرّر", remove: "احذف", drag: "اسحب", fixed: "ثابت" };

export function BlockCanvasDemo() {
  const [selected, setSelected] = useState<string | null>("b");
  const [armed, setArmed] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string>("—");
  const noop = () => undefined;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">
        لوحة الكتل · {armed ? <>منقولة: <bdi>{armed}</bdi></> : <>آخر موضع: <bdi dir="ltr">{placed}</bdi></>}
      </figcaption>
      <div className="overflow-x-auto pt-4">
        <BlockCanvas
          label="البريد"
          width={600}
          rows={ROWS}
          fixed={[{ id: "footer", label: "التذييل", box: { left: 0, top: 248, width: 600, height: 48 } }]}
          selectedId={selected}
          onSelect={setSelected}
          actions={{ moveUp: noop, moveDown: noop, move: setArmed, duplicate: noop, remove: noop }}
          labels={LABELS}
          slots={
            armed
              ? {
                  label: "أضف هنا",
                  inCells: true,
                  onPlace: (at) => {
                    setPlaced("rowId" in at ? `${at.rowId}/${at.column}/${at.index}` : String(at.index));
                    setArmed(null);
                  },
                  onCancel: () => setArmed(null),
                }
              : null
          }
        >
          <div className="flex flex-col rounded-field bg-surface" style={{ height: 296 }}>
            <div className="px-7 py-4 text-h3 text-fg-heading" style={{ height: 64 }}>جلستك غدًا</div>
            <div className="flex gap-2 px-7" style={{ height: 112 }}>
              <div className="flex-1 text-body-sm text-fg-body">مقعدك محجوز.</div>
              <div className="flex-[2] rounded-field border border-dashed border-edge" />
            </div>
            <div className="px-7 py-4" style={{ height: 72 }}>
              <span className="inline-block rounded-pill bg-fg-heading px-6 py-2 text-label text-surface">افتح الجلسة</span>
            </div>
            <div className="border-t border-edge px-7 py-3 text-caption text-fg-muted" style={{ height: 48 }}>تفضيلات الإشعارات</div>
          </div>
        </BlockCanvas>
      </div>
    </figure>
  );
}
