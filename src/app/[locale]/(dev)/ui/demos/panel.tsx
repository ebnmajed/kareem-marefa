import { Panel } from "@/components/ui/panel";

// The gallery's `panel` demo — contract 4 (DEC-183 §5, DEC-186 §5). Every tone,
// from literal fixtures. The lead renders it inside the playground's scope, where
// a toned panel takes its outline form.

export function PanelDemo() {
  return (
    <div data-demo="panel" className="flex flex-col gap-3">
      <Panel>لوحة عادية — ملخص الجلسة ومكانها وموعدها.</Panel>
      <Panel tone="info">معلومة — تصلك النقاط عند انتهاء الجلسة، لا عند الحضور.</Panel>
      <Panel tone="success">تم — حُفظت المادة ويمكن للحاضرين تنزيلها.</Panel>
      <Panel tone="live">جارٍ — الجلسة تجري الآن، وتسجيل الحضور مفتوح.</Panel>
      <Panel tone="ended">انتهت — الجلسة مكتملة، والشهادات قيد الإصدار.</Panel>
      <Panel tone="error">تعذّر — لم نتمكن من حفظ التغيير. حاول مرة أخرى.</Panel>
    </div>
  );
}
