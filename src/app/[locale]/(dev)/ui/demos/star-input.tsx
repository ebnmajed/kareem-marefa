import type { StarLabels } from "@/components/ui";
import { StarInput } from "@/components/ui/star-input";
import type { DemoGround } from "../ground";

// The gallery's `star-input` demo — REQ-UIX-064, contract 2 of wave 19. Every state from props, in
// Arabic, from literal fixtures: empty, chosen, required with an error, disabled, and the read-only
// face at both sizes. Each row is its own little form so the radios of one never uncheck another's.
// Hover a row with a pointer to see the preview fill from the right. The lead renders it inside the scope.
//
// ★ `ground` suffixes every name: the gallery renders this on both grounds on one page, and `name` is the
// group's `id` — written twice it is a duplicate id, and two groups with one `name` are one group to the
// browser (`../ground.ts`).

const LABELS: StarLabels = ["نجمة واحدة", "نجمتان", "3 نجوم", "4 نجوم", "5 نجوم"];

export function StarInputDemo({ ground }: { ground: DemoGround }) {
  return (
    <div data-demo="star-input" className="flex max-w-sm flex-col gap-6">
      <form>
        <StarInput name={`demo-empty-${ground}`} legend="تقييم الجلسة" starLabels={LABELS} size="lg" required requiredLabel="مطلوب" />
      </form>
      <form>
        <StarInput name={`demo-chosen-${ground}`} legend="تقييم المُقدِّم" starLabels={LABELS} size="lg" defaultValue={4} />
      </form>
      <form>
        <StarInput name={`demo-error-${ground}`} legend="تقييم الجلسة" starLabels={LABELS} required requiredLabel="مطلوب" error="اختر عدد النجوم" />
      </form>
      <form>
        <StarInput name={`demo-disabled-${ground}`} legend="تقييم الجلسة" starLabels={LABELS} defaultValue={2} disabled />
      </form>
      <StarInput readOnly value={5} legend="تقييم الجلسة" label="تقييم الجلسة: 5 نجوم" starLabels={LABELS} size="lg" />
      <StarInput readOnly value={3} legend="تقييم المُقدِّم" label="تقييم المُقدِّم: 3 نجوم" starLabels={LABELS} />
    </div>
  );
}
