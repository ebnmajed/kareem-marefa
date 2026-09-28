import { Field } from "@/components/ui/field";
import { SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

// The gallery's `input` demo — contract 4 (DEC-183 §5, DEC-186 §6). The three sizes,
// a placeholder, the start icon, an email left to right, invalid and disabled, from
// literal fixtures. The lead renders it inside the playground's scope, where the face
// is `controlClass()`'s: the input's corner, the raised face, the 3:1 edge.
//
// No `id` is passed: `<Field>` generates one, so the two grounds never share one.

export function InputDemo() {
  return (
    <div data-demo="input" className="flex max-w-md flex-col gap-6">
      <Input aria-label="بحث في الجلسات" name="demo-input-search" startIcon={<SearchIcon />} placeholder="ابحث عن جلسة أو مقدِّم" />
      <Field label="الاسم" required>
        <Input name="demo-input-name" size="lg" defaultValue="ريم العتيبي" />
      </Field>
      <Field label="البريد الإلكتروني" hint="نراسلك عليه بشأن الجلسة فقط.">
        <Input name="demo-input-email" size="lg" type="email" dir="ltr" placeholder="name@example.com" />
      </Field>
      <Field label="المدة بالدقائق" error="اكتب مدة بين 15 و240 دقيقة.">
        <Input name="demo-input-duration" inputMode="numeric" dir="ltr" defaultValue="5" />
      </Field>
      <Field label="المقاعد — صف مكثّف">
        <Input name="demo-input-dense" size="sm" defaultValue="40" />
      </Field>
      <Field label="رابط الجلسة — مقفل بعد النشر">
        <Input name="demo-input-disabled" dir="ltr" defaultValue="kareem.example/s/20" disabled />
      </Field>
    </div>
  );
}
