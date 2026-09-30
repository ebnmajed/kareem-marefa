import { SubmitButton } from "@/components/ui/submit-button";

// The gallery's `submit-button` demo — wave 17, contract 3 (DEC-199 §3).
// `button`'s primary, wired to the form it stands in. The form's own pending
// cannot be held still from props, so the pending state here is the `pending`
// prop — the same path (`pending ?? status.pending`). Each stands in a form,
// because outside one the hook has nothing to report.

export function SubmitButtonDemo() {
  return (
    <div data-demo="submit-button" className="flex flex-col gap-4">
      <form className="flex flex-wrap items-center gap-3">
        <SubmitButton>أرسل الاقتراح</SubmitButton>
        <SubmitButton variant="secondary" size="md">
          احفظ مسودة
        </SubmitButton>
      </form>
      <form data-state="pending" className="flex flex-wrap items-center gap-3">
        <SubmitButton pending pendingLabel="جارٍ الإرسال…">
          أرسل الاقتراح
        </SubmitButton>
        <SubmitButton variant="secondary" size="md" pending pendingLabel="جارٍ الحفظ…">
          احفظ مسودة
        </SubmitButton>
      </form>
      <form data-state="disabled" className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled>أرسل الاقتراح</SubmitButton>
      </form>
    </div>
  );
}
