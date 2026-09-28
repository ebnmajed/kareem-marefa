import { Progress } from "@/components/ui/progress";

// The gallery's `progress` demo — contract 4 (DEC-183 §5, DEC-186 §5). Every
// tone, determinate and indeterminate, from literal fixtures. The lead renders
// it inside the playground's scope. `progress-bar` is the playground's own bar;
// this one keeps its width fill until its consumers adopt that one.

export function ProgressDemo() {
  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-muted">
          المقاعد المحجوزة · <bdi>18 من 40</bdi>
        </span>
        <Progress value={18} max={40} label="المقاعد المحجوزة" valueText="18 من 40" />
      </div>
      <Progress value={40} max={40} label="اكتمل الحجز" valueText="40 من 40" tone="success" />
      <Progress value={34} max={40} label="يُغلق التسجيل قريبًا" valueText="34 من 40" tone="live" />
      <Progress value={12} max={40} label="انتهت" valueText="12 من 40" tone="ended" />
      <Progress value={5} max={40} label="تعذّر" valueText="5 من 40" tone="error" />
      <Progress label="بانتظار الرفع" />
    </div>
  );
}
