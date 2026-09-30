import { Link } from "@/components/ui/link";

// The gallery's `link` demo — wave 17, contract 3 (DEC-199 §3, §5.25). The house
// link draws nothing of its own: its colour is the text's and the underline is
// the affordance, given where it stands. So it is shown where it stands — in a
// sentence, in a muted line, quiet, and around a Latin name.
//
// ★ The pending dot is not here. It is drawn only while a real navigation is
// pending (`useLinkStatus`), which no prop can hold still; the gallery spec
// stalls a navigation and captures it (sync 1).

export function LinkDemo() {
  return (
    <div data-demo="link" className="flex flex-col gap-3">
      <p className="text-body text-fg-body">
        المواد في{" "}
        <Link href="/ui" className="text-fg-heading underline underline-offset-4">
          صفحة الجلسة
        </Link>{" "}
        بعد انتهائها.
      </p>
      <p className="text-body-sm text-fg-muted">
        قدّمها{" "}
        <Link href="/ui" className="underline underline-offset-4 hover:text-fg-heading">
          <bdi>Sara Al-Harbi</bdi>
        </Link>{" "}
        ضمن مسار القياس.
      </p>
      <p className="text-caption text-fg-muted">
        <Link href="/ui" quiet className="underline-offset-4 hover:text-fg-heading hover:underline">
          الجلسات
        </Link>
      </p>
      <p className="text-body text-fg-heading">
        <Link href="/ui">رابط بلا صنف من صاحبه</Link>
      </p>
    </div>
  );
}
