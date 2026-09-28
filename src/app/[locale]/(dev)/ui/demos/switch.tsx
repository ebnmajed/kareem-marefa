import { Switch } from "@/components/ui/switch";

// The gallery's `switch` demo — contract 4 (DEC-183 §5, DEC-186 §6). Off, on, a
// description, and disabled, from literal fixtures. The lead renders it inside the
// playground's scope, where the ON track is the accent on the dark ground and the
// text colour on the light one, and the ring is 3 px.

export function SwitchDemo() {
  return (
    <div className="flex flex-col gap-4">
      <Switch name="demo-walk-ins" label="السماح بالحضور دون حجز" description="يُسجَّل الحاضر دون مقعد محجوز، حتى تمتلئ القاعة." />
      <Switch name="demo-check-in" label="تسجيل الحضور مفتوح" defaultChecked />
      <Switch name="demo-all-days" label="الشهادة تتطلّب حضور كل الأيام" defaultChecked disabled />
      <Switch name="demo-reminders" label="تذكير قبل الجلسة بساعة" disabled />
    </div>
  );
}
