import { LedgerRow } from "@/components/ui/ledger-row";

// `ledger-row`'s gallery entry — REQ-UIX-081 (DEC-216, DEC-218). Literals only: no DAL, no session, no catalogue.
// It carries NO scope of its own: `playground.tsx` renders it on each ground. Every form: a gain, a manual
// adjustment, the cap explanation drawn as `0`, the reversal pair in one row, a missed-day notice with no figure.

export function LedgerRowDemo() {
  return (
    <div data-demo="ledger-row" className="flex max-w-md flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        <LedgerRow value={50} figure="+50" figureLabel="50 نقطة" title="حضور جلسة" meta="الأرقام التي تكذب · أمس 8:02 م" />
        <LedgerRow value={20} figure="+20" figureLabel="20 نقطة" title="تعديل يدوي من الإدارة" meta="«تنظيم قاعة جدة» — عبدالله المطيري · 20 سبتمبر" />
        <LedgerRow kind="cap" value={0} figure="0" figureLabel="0 نقطة" title="تعليق" meta="الحد: 3 تعليقات لكل جلسة · أمس 7:05 م" />
        <LedgerRow
          kind="reversal"
          value={-50}
          figure="−50"
          figureLabel="خُصمت 50 نقطة"
          title="إلغاء نقاط سابقة"
          meta="أُلغي تسجيل الحضور · 16 سبتمبر"
          reversed={{ figure: "+50", figureLabel: "50 نقطة", title: "حضور جلسة", meta: "ورشة الإضاءة للمبتدئين · 15 سبتمبر" }}
        />
        <LedgerRow kind="notice" title="لم تُحتسب نقاط الحضور" meta="فاتك اليوم الثاني · ورشة ثلاثة أيام" />
        <LedgerRow value={1205} figure="+1,205" figureLabel="1,205 نقطة" title="عنوان سبب طويل جدًا يلتفّ على سطرين في الشاشة الضيقة دون أن يُقصّ" meta="جلسة بعنوان طويل أيضًا · 14 سبتمبر" />
      </ul>
    </div>
  );
}
