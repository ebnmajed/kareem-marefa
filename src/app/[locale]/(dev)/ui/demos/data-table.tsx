"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";

// The gallery's `data-table` demo — contract 4 (DEC-183 §5, DEC-186). Every
// state, from literal fixtures: no DAL, no session. The lead renders it
// inside the playground's scope. Selection is local state so the row that
// demonstrates `pg:bg-raised`'s banner can actually be seen without a click.

interface DemoSession {
  id: string;
  title: string;
  presenter: string;
  seats: number;
}

const ROWS: DemoSession[] = [
  { id: "s1", title: "أساسيات التلوين السينمائي", presenter: "سارة العتيبي", seats: 24 },
  { id: "s2", title: "بناء نظام تصميم من الصفر", presenter: "خالد الحربي", seats: 40 },
  { id: "s3", title: "كتابة سيناريو الجلسة القصيرة", presenter: "منى القحطاني", seats: 12 },
];

const COLUMNS: DataTableColumn<DemoSession>[] = [
  { key: "title", header: "العنوان", onCard: true, cell: (r) => <bdi>{r.title}</bdi> },
  { key: "presenter", header: "المقدِّم", onCard: true, cell: (r) => <bdi>{r.presenter}</bdi> },
  { key: "seats", header: "المقاعد", onCard: true, sortable: true, align: "end", cell: (r) => String(r.seats) },
];

export function DataTableDemo() {
  const [selected, setSelected] = useState<string[]>(["s1"]);
  return (
    <div className="flex flex-col gap-8">
      <DataTable<DemoSession>
        label="جلسات هذا الأسبوع"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        selection={{
          selected,
          onChange: setSelected,
          label: (n) => `${n} محدّدة`,
          actions: (
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              إلغاء التحديد
            </Button>
          ),
        }}
        empty={{ title: "لا جلسات", action: { label: "امسح عامل التصفية", onClick: () => {} } }}
      />
      <DataTable<DemoSession>
        label="جلسات فارغة"
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        empty={{ title: "لا جلسات بعد", action: { label: "أضف جلسة", onClick: () => {} } }}
      />
      <DataTable<DemoSession>
        label="جلسات قيد التحميل"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        pending
        empty={{ title: "لا جلسات", action: { label: "أضف جلسة", onClick: () => {} } }}
      />
    </div>
  );
}
