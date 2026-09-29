"use client";

import { SessionCta } from "@/components/ui/session-cta";

// The gallery's `session-cta` demo — contract 4 (DEC-183 §5, DEC-186 §6). All six
// states of REQ-UIX-033 — reserve, the waitlist, booked (a seat, and a place on the
// waitlist), check in, attended, none with its reason — and a reservation in flight,
// from literal fixtures. The lead renders it inside the playground's scope.
//
// A client island because an `action` is a function: in the product it is a bound
// Server Action (DEC-159); here it answers nothing, which is exactly the pending
// state a press leaves the control in — and it never turns into «محجوز» on its own.

const nothing = async () => {};

export function SessionCtaDemo() {
  return (
    <div data-demo="session-cta" className="flex max-w-sm flex-col gap-6">
      <SessionCta state={{ kind: "reserve", act: { action: nothing } }} label="احجز مقعدك" chip="12 من 40" />
      <SessionCta state={{ kind: "reserve", act: { action: nothing } }} label="احجز مقعدك" chip="12 من 40" pending pendingLabel="جارٍ الحجز…" />
      <SessionCta state={{ kind: "waitlist", act: { action: nothing } }} label="انضمّ إلى قائمة الانتظار" chip="3 في الانتظار" />
      <SessionCta
        state={{
          kind: "booked",
          cancel: { label: "إلغاء الحجز (سيُسجَّل كإلغاء متأخر)", act: { action: nothing }, note: "تجاوزت آخر موعد للإلغاء دون تأخر — سيُسجَّل هذا كإلغاء متأخر." },
        }}
        label="محجوز"
        chip="13 من 40"
      />
      <SessionCta
        state={{ kind: "booked", hold: "waitlist", cancel: { label: "غادر قائمة الانتظار", act: { action: nothing } } }}
        label="على قائمة الانتظار"
        chip="ترتيبك 3"
      />
      <SessionCta state={{ kind: "checkIn", act: { href: "/app/sessions/demo/check-in" } }} label="سجّل حضورك" />
      {/* A chip is a few characters; the sentence is the state's note, beneath it. */}
      <SessionCta state={{ kind: "attended", note: "تصل النقاط عند انتهاء الجلسة." }} label="حضرت" chip="+50" />
      <SessionCta state={{ kind: "none", reason: "انتهى وقت الحجز لهذه الجلسة." }} label="الحجز مغلق" />
    </div>
  );
}
