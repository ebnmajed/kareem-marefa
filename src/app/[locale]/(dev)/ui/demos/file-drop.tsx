import { FileDrop } from "@/components/ui/file-drop";

// The gallery's `file-drop` demo — contract 4 (DEC-183 §5, DEC-186 §5). The
// states a prop can set: at rest with its rules stated, invalid, disabled. A
// picked file, a refused one and drag-over live in the control's own state, so
// the capture spec drops files on the first zone to show them. No upload is
// sent from here: there is no `onFiles` and no form. No SVG, and documents are
// PDF only (invariant 11).

export function FileDropDemo() {
  return (
    <div className="flex max-w-md flex-col gap-4" data-demo="file-drop">
      <FileDrop
        name="demo-material"
        accept={["application/pdf"]}
        maxBytes={20_000_000}
        multiple
        requirements={[
          <span key="type">
            <bdi>PDF</bdi> فقط
          </span>,
          <span key="size">
            بحد أقصى <bdi>20 ميغابايت</bdi> للملف
          </span>,
        ]}
      />
      <FileDrop name="demo-photo" accept={["image/jpeg", "image/png", "image/webp"]} maxBytes={15_000_000} invalid requirements={["صورة واحدة على الأقل مطلوبة"]} />
      <FileDrop name="demo-disabled" accept={["application/pdf"]} maxBytes={20_000_000} disabled />
    </div>
  );
}
