"use client";

import { RouteError } from "@/components/ui/route-error";

// The gallery's `route-error` demo — contract 4. With a retry and without one: a
// not-found has nothing to retry. A client file, because the retry is a function.
// Inside the dark scope the mark reads the error's on-dark constant (DEC-073), and
// the retry is the accent.

export function RouteErrorDemo() {
  return (
    <div data-demo="route-error" className="flex flex-col gap-2">
      <RouteError
        title="تعذّر تحميل الجلسة"
        description="حدث خطأ من جهتنا. حاول مرة أخرى بعد لحظة."
        retryLabel="أعد المحاولة"
        reset={() => undefined}
        backLabel="العودة إلى الجلسات"
        backHref="#top"
        digest="3f9a1c"
      />
      <RouteError title="هذه الجلسة غير موجودة" description="ربما حُذفت، أو أن الرابط ناقص." backLabel="العودة إلى الجلسات" backHref="#top" />
    </div>
  );
}
