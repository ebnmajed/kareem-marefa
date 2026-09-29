import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

// The gallery's `select` demo — contract 4 (DEC-183 §5, DEC-186 §6). At rest on its
// prompt, with a chosen option, invalid, disabled, and inside a `Field` with a hint,
// from literal fixtures. The lead renders it inside the playground's scope, where
// its face is `controlClass()`'s and the native arrow and picker follow the scope's
// `color-scheme` — no drawn chevron, by design (`select.tsx`).
//
// No `id` is passed: `<Field>` generates one, so the two grounds never share one.

const CATEGORIES = [
  { value: "technical", label: "تقني" },
  { value: "leadership", label: "قيادة" },
  { value: "product", label: "منتج" },
  { value: "culture", label: "ثقافة الفريق" },
];

function Options({ prompt }: { prompt?: string }) {
  return (
    <>
      {prompt ? <option value="">{prompt}</option> : null}
      {CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </>
  );
}

export function SelectDemo() {
  return (
    <div data-demo="select" className="flex max-w-md flex-col gap-6">
      <Field label="الفئة">
        <Select name="demo-select-rest" defaultValue="">
          <Options prompt="اختر فئة" />
        </Select>
      </Field>
      <Field label="الفئة — مختارة">
        <Select name="demo-select-chosen" defaultValue="leadership">
          <Options />
        </Select>
      </Field>
      <Field label="الفئة — مطلوبة" error="اختر فئة واحدة." required>
        <Select name="demo-select-invalid" defaultValue="">
          <Options prompt="اختر فئة" />
        </Select>
      </Field>
      <Field label="الفئة — مقفلة بعد النشر">
        <Select name="demo-select-disabled" defaultValue="product" disabled>
          <Options />
        </Select>
      </Field>
      <Field label="لغة الجلسة" hint="تحدّد لغة الشهادة والتذكيرات.">
        <Select name="demo-select-language" defaultValue="ar">
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </Select>
      </Field>
    </div>
  );
}
