"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

// The gallery's `sheet` demo — contract 4 (DEC-183 §5, DEC-186). Every side,
// from literal fixtures: no DAL, no session. The lead renders it inside the
// playground's scope. No new prop this wave (DEC-186 §8): the bottom sheet,
// as it is today.

export function SheetDemo() {
  const [open, setOpen] = useState<"bottom" | "inline-start" | "inline-end" | null>(null);
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setOpen("bottom")}>ورقة سفلية</Button>
      <Button variant="secondary" onClick={() => setOpen("inline-start")}>
        ورقة جانبية
      </Button>
      {open ? (
        <Sheet open onOpenChange={(next) => !next && setOpen(null)} title="تصفية النتائج" description="اختر المعايير" side={open}>
          <p className="text-body text-fg-body">محتوى الورقة</p>
        </Sheet>
      ) : null}
    </div>
  );
}
