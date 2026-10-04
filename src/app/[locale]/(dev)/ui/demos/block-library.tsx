"use client";

import { useState } from "react";
import { BlockLibrary } from "@/components/ui/block-library";

// `block-library`'s gallery entry — REQ-UIX-112, DEC-093. Literals only: the builder's twelve blocks in the drawn order
// (نقاطك drawn and not built, so eleven) and its four layouts. A tap arms a tile; a tap on it again disarms.

const BLOCKS = ["نص", "صورة", "زر", "فاصل", "مسافة", "بطاقة الجلسة", "الملصق", "رمز QR", "الشعار", "شهادة", "اجتماعي"].map((label) => ({
  key: label,
  label,
  glyph: <span className="inline-block size-4 rounded-sm border border-current" />,
}));

const LAYOUTS = [
  { key: "1", label: "عمود واحد", weights: [1] },
  { key: "1/1", label: "عمودان متساويان", weights: [1, 1] },
  { key: "1/2", label: "عمودان، الثاني أعرض", weights: [1, 2] },
  { key: "1/1/1", label: "ثلاثة أعمدة", weights: [1, 1, 1] },
];

export function BlockLibraryDemo() {
  const [armed, setArmed] = useState<string | null>("رمز QR");
  return (
    <figure className="flex max-w-[18.75rem] flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">
        مكتبة الكتل · {armed ? <bdi>{armed}</bdi> : "لا شيء مختار"}
      </figcaption>
      <BlockLibrary label="الكتل" items={BLOCKS} armed={armed} onArm={setArmed} />
      <BlockLibrary label="التخطيطات" variant="layouts" items={LAYOUTS} armed={armed} onArm={setArmed} />
    </figure>
  );
}
