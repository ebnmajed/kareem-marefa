import { CodeInput } from "@/components/ui/code-input";

// The gallery's `code-input` demo — contract 4 (DEC-183 §5, DEC-186 §4, §6). Empty,
// partly typed, complete, refused and disabled, from literal fixtures. ★ The code
// is from the migration's alphabet (`0010_m2_schema.sql:210`) — «M7K3QX», never the
// prototype's «M7K2QX», which holds a 2 the product can never issue. The lead
// renders it inside the playground's scope: 48 × 60 boxes on the raised face, the
// display face, the accent border once complete — and nothing moves.

const POSITIONS = [1, 2, 3, 4, 5, 6].map((n) => `الخانة ${n} من 6`);

export function CodeInputDemo() {
  return (
    <div className="flex max-w-sm flex-col gap-6">
      <CodeInput name="demo-code-empty" id="demo-code-empty" label="رمز الحضور" positionLabels={POSITIONS} />
      <CodeInput name="demo-code-partial" id="demo-code-partial" label="رمز الحضور — نصف مكتوب" positionLabels={POSITIONS} defaultValue="M7K" />
      <CodeInput name="demo-code-complete" id="demo-code-complete" label="رمز الحضور — مكتمل" positionLabels={POSITIONS} defaultValue="M7K3QX" />
      <CodeInput
        name="demo-code-refused"
        id="demo-code-refused"
        label="رمز الحضور — مرفوض"
        positionLabels={POSITIONS}
        defaultValue="M7K3QA"
        error="الرمز غير صحيح — تأكد من الرمز المعروض الآن"
      />
      <CodeInput name="demo-code-disabled" id="demo-code-disabled" label="رمز الحضور — مغلق" positionLabels={POSITIONS} disabled />
    </div>
  );
}
