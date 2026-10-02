"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableActionPair, DataTableSwatchCell, DataTableSwitchCell } from "@/components/ui/data-table";
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

interface DemoRule {
  id: string;
  name: string;
  company: string;
  color: string | null;
  colorName: string;
  enabled: boolean;
}

const RULES: DemoRule[] = [
  { id: "c1", name: "تسجيل الحضور", company: "شبه الجزيرة", color: "#35d0ff", colorName: "سماوي", enabled: true },
  { id: "c2", name: "تقييم الجلسة", company: "دبابيس", color: null, colorName: "بلا لون", enabled: false },
];

const CELL_COLUMNS = (rules: DemoRule[], setRules: (rows: DemoRule[]) => void): DataTableColumn<DemoRule>[] => [
  { key: "name", header: "الفعل", onCard: true, cell: (r) => <bdi>{r.name}</bdi> },
  {
    key: "company",
    header: "الشركة",
    onCard: true,
    cell: (r) => (
      <DataTableSwatchCell color={r.color} colorName={r.colorName}>
        <bdi>{r.company}</bdi>
      </DataTableSwatchCell>
    ),
  },
  {
    key: "enabled",
    header: "مفعّل",
    onCard: true,
    cell: (r) => (
      <DataTableSwitchCell
        checked={r.enabled}
        label="مفعّل"
        rowName={r.name}
        announce={{ on: "مفعّل", off: "معطّل", failed: "لم يُحفظ" }}
        onCheckedChange={async (next) => {
          setRules(rules.map((x) => (x.id === r.id ? { ...x, enabled: next } : x)));
          return true;
        }}
      />
    ),
  },
  {
    key: "decide",
    header: "القرار",
    onCard: true,
    cell: (r) => <DataTableActionPair rowName={r.name} primary={{ label: "أخفِ", tone: "danger", onAction: () => {} }} secondary={{ label: "تجاهل", onAction: () => {} }} />,
  },
];

export function DataTableDemo() {
  const [selected, setSelected] = useState<string[]>(["s1"]);
  const [rules, setRules] = useState<DemoRule[]>(RULES);
  return (
    <div data-demo="data-table" className="flex flex-col gap-8">
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
      {/* Wave 22's three cells (REQ-UIX-092): a switch, a pair of decisions, a swatch — each in the table and the card. */}
      <DataTable<DemoRule>
        label="قواعد النقاط والشركات"
        columns={CELL_COLUMNS(rules, setRules)}
        rows={rules}
        rowKey={(r) => r.id}
        empty={{ title: "لا قواعد", action: { label: "أضف قاعدة", onClick: () => {} } }}
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
