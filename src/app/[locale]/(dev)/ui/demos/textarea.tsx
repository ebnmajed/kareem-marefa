import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

// The gallery's `textarea` demo — contract 4 (DEC-183 §5, DEC-186 §6). The long-form
// default, three rows, and an error, from literal fixtures. The lead renders it inside
// the playground's scope, where its face is `controlClass()`'s.
//
// No `id` is passed: `<Field>` generates one, so the two grounds never share one.

export function TextareaDemo() {
  return (
    <div data-demo="textarea" className="flex max-w-md flex-col gap-6">
      <Field label="نبذة عن الجلسة" hint="ما الذي سيأخذه الحاضر معه؟ جملتان أو ثلاث." required>
        <Textarea name="demo-textarea-abstract" defaultValue="كيف اختصرنا وقت إعداد التقارير الشهرية إلى النصف، وما الذي تعلّمناه من الأخطاء في الطريق." />
      </Field>
      <Field label="تعليق قصير">
        <Textarea name="demo-textarea-comment" rows={3} placeholder="اكتب تعليقك" />
      </Field>
      <Field label="سبب الرفض" error="اكتب سببًا يفهمه المقترِح." required>
        <Textarea name="demo-textarea-reason" rows={3} />
      </Field>
    </div>
  );
}
