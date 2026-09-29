"use client";

import { Button } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";

// The gallery's `toast` demo — contract 4, DEC-188 §6. In the app the toast region
// is the shell's and stands OUTSIDE the scope. Here the demo mounts a provider of
// its own inside the scope, so the region is inside it and a toast wears the
// scope's forms: the raised face, the tile's corner, the on-dark status colours.
// Nothing is raised until a button is pressed, so the capture holds the buttons;
// `tests/e2e/wave15-lead-gallery.spec.ts` raises each tone and measures it.

function Raise() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="quiet" size="md" onClick={() => toast.show({ tone: "success", title: "حُجز مقعدك", description: "الخميس 6:30 م · قاعة الرياض" })}>
        نجاح
      </Button>
      <Button variant="quiet" size="md" onClick={() => toast.show({ tone: "error", title: "تعذّر الحجز", description: "اكتملت المقاعد قبل لحظة." })}>
        خطأ
      </Button>
      <Button
        variant="quiet"
        size="md"
        onClick={() => toast.show({ tone: "info", title: "أُلغي حجزك", action: { label: "تراجع", onClick: () => undefined } })}
      >
        معلومة مع تراجع
      </Button>
    </div>
  );
}

export function ToastDemo() {
  return (
    <div data-demo="toast">
      <ToastProvider closeLabel="إغلاق" label="الإشعارات">
        <Raise />
      </ToastProvider>
    </div>
  );
}
