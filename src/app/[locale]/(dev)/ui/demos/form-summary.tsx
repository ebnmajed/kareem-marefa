import { FormSummary } from "@/components/ui/form-summary";

// The gallery's `form-summary` demo — contract 4 (DEC-183 §5, DEC-186 §6). Three
// errors, one naming a field by what a member typed, with the reassurance line,
// from literal fixtures. The links point at nothing on the gallery page, so a
// click falls back to the fragment. The lead renders it inside the playground's
// scope, where the summary is an outline in the error's on-dark constant.
//
// ★ `FormSummary` focuses itself on mount — that is its job (REQ-UIX-010) — and
// `focus()` scrolls it into view. On the gallery page that moves the scroll
// position at load, which a full-page capture must allow for.

export function FormSummaryDemo() {
  return (
    <div data-demo="form-summary">
      <FormSummary
        title="تعذّر إرسال النموذج"
        description="ما كتبته محفوظ كما هو."
        errors={[
          { fieldId: "demo-title", label: "عنوان الجلسة", message: "اكتب عنوانًا من 3 أحرف على الأقل" },
          { fieldId: "demo-category", label: "الفئة", message: "اختر فئة واحدة" },
          { fieldId: "demo-q3", label: "ماذا تقترح للجلسة القادمة؟", message: "هذا السؤال مطلوب" },
        ]}
      />
    </div>
  );
}
