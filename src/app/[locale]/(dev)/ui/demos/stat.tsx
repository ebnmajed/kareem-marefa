import { Stat } from "@/components/ui/stat";

// The gallery's `stat` demo — contract 4 (DEC-183 §5, DEC-186 §5). Every state,
// from literal fixtures, values pre-formatted in Western digits. The lead
// renders it inside the playground's scope.

export function StatDemo() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="الحضور" value="124" hint="هذا الشهر" />
      <Stat label="الجلسات" value="18" href="/ar/ui" />
      <Stat label="النقاط" value="1,410" hint="منذ بداية الموسم" />
      <Stat label="مكتملة" value="12" tone="success" />
      <Stat label="جارية الآن" value="2" tone="live" />
      <Stat label="انتهت" value="31" tone="ended" />
      <Stat label="أُلغيت" value="1" tone="error" href="/ar/ui" />
    </div>
  );
}
