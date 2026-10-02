import { KvCard } from "@/components/ui/kv-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// `kv-card`'s gallery entry — REQ-UIX-085, REQ-UIX-089. `sessions'`; the lead's stub (contract 2), which `sessions`
// extends to every state of its plan. Literals only. No scope of its own.

const ROWS = [
  { id: "date", label: "الموعد", value: "الخميس 2 أكتوبر · 6:30 م – 8:00 م" },
  { id: "venue", label: "المكان", value: "قاعة الرياض" },
  { id: "capacity", label: "السعة", value: <bdi>40</bdi> },
  { id: "close", label: "إغلاق التسجيل", value: null },
];

export function KvCardDemo() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <KvCard label="الجدولة" rows={ROWS} emptyValue="—" actions={<Button>عدّل</Button>} />
      <KvCard
        title="الجدولة"
        mode="edit"
        emptyValue="—"
        rows={ROWS.map((row) => ({ ...row, edit: row.id === "capacity" ? undefined : (
              <Field label={row.label}>
                <Input name={`demo-kv-${row.id}`} defaultValue={typeof row.value === "string" ? row.value : ""} />
              </Field>
            ) }))}
      />
    </div>
  );
}
