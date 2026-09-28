import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// The gallery's `field` demo — contract 4 (DEC-183 §5, DEC-186 §6). A label alone,
// a hint, «مطلوب», an error, and a label quoting what a member typed in `<bdi>`, from
// literal fixtures. The lead renders it inside the playground's scope, where the
// control takes the input's corner and the raised face, and the error its on-dark
// form.
//
// No `id` is passed: `<Field>` generates one, so the two grounds the gallery renders
// never share one (`../ground.ts`).

export function FieldDemo() {
  return (
    <div data-demo="field" className="flex max-w-md flex-col gap-6">
      <Field label="عنوان الجلسة">
        <Input name="demo-field-title" defaultValue="كيف اختصرنا وقت التقارير" />
      </Field>
      <Field label="البريد الإلكتروني" hint="نراسلك عليه بشأن الجلسة فقط." required>
        <Input name="demo-field-email" type="email" dir="ltr" defaultValue="reem@example.com" />
      </Field>
      <Field label="المدة بالدقائق" error="اكتب مدة بين 15 و240 دقيقة." required>
        <Input name="demo-field-duration" inputMode="numeric" dir="ltr" defaultValue="5" />
      </Field>
      <Field
        label={
          <>
            ما رأيك في <bdi>تصميم الواجهات</bdi>؟
          </>
        }
      >
        <Input name="demo-field-question" />
      </Field>
    </div>
  );
}
