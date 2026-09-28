import { RadioGroup } from "@/components/ui/radio-group";
import type { DemoGround } from "../ground";

// The gallery's `radio-group` demo — contract 4 (DEC-183 §5, DEC-186 §6). A
// chosen option, a hint, a disabled option, and a group carrying its error, from
// literal fixtures. The lead renders it inside the playground's scope, where the
// rows take the input's corner and the error its on-dark form.
//
// ★ `ground` suffixes each group's name: the gallery renders this twice on one page,
// and two radio groups with one `name` are one group to the browser (`../ground.ts`).

const LEVELS = [
  { value: "introductory", label: "تمهيدي", hint: "لا يحتاج معرفة سابقة بالموضوع" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "متقدم", hint: "المقاعد محجوزة لفريق البيانات", disabled: true },
];

const FORMAT = [
  { value: "talk", label: "محاضرة" },
  { value: "workshop", label: "ورشة عمل" },
];

export function RadioGroupDemo({ ground }: { ground: DemoGround }) {
  return (
    <div className="flex flex-col gap-6">
      <RadioGroup name={`demo-level-${ground}`} legend="مستوى الجلسة" options={LEVELS} defaultValue="intermediate" />
      <RadioGroup name={`demo-format-${ground}`} legend="شكل الجلسة" options={FORMAT} error="اختر شكل الجلسة قبل الإرسال" />
    </div>
  );
}
