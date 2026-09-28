import { Checkbox } from "@/components/ui/checkbox";

// The gallery's `checkbox` demo — contract 4 (DEC-183 §5, DEC-186 §6). Off, on,
// disabled and a label of two lines, from literal fixtures. The lead renders it
// inside the playground's scope, where the row takes the input's corner and the
// tick the accent.

export function CheckboxDemo() {
  return (
    <fieldset data-demo="checkbox" className="flex flex-col gap-1">
      <legend className="text-label text-fg-heading">المواضيع التي تهمّك</legend>
      <Checkbox name="topics" value="design" label="تصميم الواجهات" />
      <Checkbox name="topics" value="data" label="تحليل البيانات" defaultChecked />
      <Checkbox name="topics" value="ops" label="العمليات — مغلق هذا الموسم" disabled />
      <Checkbox
        name="coPresenters"
        value="m1"
        label={
          <span className="flex flex-col">
            <bdi>ريم العتيبي</bdi>
            <span className="text-caption text-fg-muted">مصمّمة منتجات — شبه الجزيرة</span>
          </span>
        }
      />
    </fieldset>
  );
}
