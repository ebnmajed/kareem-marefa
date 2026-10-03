"use client";

import { useState } from "react";
import type { EditorRailItem } from "@/components/ui";
import { EditorRail } from "@/components/ui/editor-rail";

// `editor-rail`'s gallery entry — REQ-UIX-107, DEC-237. Literals only: the designer's rail with الطبقة present (a layer
// is selected) and three findings on الفحوصات, and the email builder's with الكتلة. No scope of its own: the gallery
// renders it on each of the scope's grounds.

const DESIGNER: EditorRailItem[] = [
  { key: "elements", label: "العناصر", glyph: "elements" },
  { key: "fields", label: "الحقول", glyph: "fields" },
  { key: "uploads", label: "الملفات", glyph: "uploads" },
  { key: "brand", label: "الهوية", glyph: "brand" },
  { key: "layers", label: "الطبقات", glyph: "layers" },
  { key: "checks", label: "الفحوصات", glyph: "checks", count: { value: 3, label: "3 ملاحظات" } },
  { key: "layer", label: "الطبقة", glyph: "layer" },
];

const EMAIL: EditorRailItem[] = [
  { key: "add", label: "إضافة", glyph: "add" },
  { key: "styles", label: "الأنماط", glyph: "styles" },
  { key: "layouts", label: "التخطيطات", glyph: "layouts" },
  { key: "block", label: "الكتلة", glyph: "block" },
];

function One({ items, initial, title }: { items: EditorRailItem[]; initial: string; title: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <figure className="flex min-w-0 max-w-full flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      <div className="h-[22rem] max-w-full overflow-x-auto rounded-panel border border-edge bg-canvas">
        <EditorRail label={title} items={items} selected={selected} onSelect={setSelected}>
          <p className="text-body-sm text-fg-muted">
            <bdi>{items.find((i) => i.key === selected)?.label}</bdi>
          </p>
        </EditorRail>
      </div>
    </figure>
  );
}

export function EditorRailDemo() {
  return (
    <div className="flex min-w-0 flex-wrap gap-6">
      <One items={DESIGNER} initial="layer" title="المصمّم — طبقة محدّدة" />
      <One items={EMAIL} initial="add" title="محرّر البريد" />
    </div>
  );
}
