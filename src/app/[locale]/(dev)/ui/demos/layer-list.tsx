"use client";

import { useState } from "react";
import { LayerList } from "@/components/ui/layer-list";

// `layer-list`'s gallery entry — REQ-DSG-028, DEC-093 path 2, DEC-235 §5.1. Literals only: a poster's layers, front
// first, one selected, one locked (its hide refused), one hidden; ▲▼ move a row, and the grip drags it beside them.

type Row = { id: string; name: string; kindLabel: string; locked?: boolean; hidden?: boolean };

const START: Row[] = [
  { id: "title", name: "عنوان الجلسة", kindLabel: "نص" },
  { id: "when", name: "الموعد", kindLabel: "حقل ديناميكي" },
  { id: "logo", name: "شعار المؤسسة", kindLabel: "صورة", locked: true },
  { id: "rule", name: "خط الشبكة", kindLabel: "شكل", hidden: true },
];

const LABELS = {
  forward: "طبقة إلى الأمام",
  backward: "طبقة إلى الخلف",
  show: "إظهار",
  hide: "إخفاء",
  locked: "مقفلة",
  hidden: "مخفية",
  empty: "لا طبقات في هذا المستند بعد.",
  handle: "اسحب لتغيير الترتيب",
};

export function LayerListDemo() {
  const [rows, setRows] = useState(START);
  const [selected, setSelected] = useState("title");
  const move = (id: string, to: number) =>
    setRows((current) => {
      const from = current.findIndex((r) => r.id === id);
      const next = [...current];
      const [row] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, row);
      return next;
    });
  return (
    <div className="w-full max-w-[22rem]">
      <LayerList
        label="الطبقات"
        items={rows.map((r) => ({ ...r, selected: r.id === selected }))}
        onSelect={(id) => setSelected(id)}
        onMove={(id, m) => move(id, rows.findIndex((r) => r.id === id) + (m === "forward" ? -1 : 1))}
        onReorder={move}
        onToggleHidden={(id) => setRows((current) => current.map((r) => (r.id === id ? { ...r, hidden: !r.hidden } : r)))}
        labels={LABELS}
      />
    </div>
  );
}
