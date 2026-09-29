"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";

// The gallery's `dialog` demo — contract 4, contract 6 (DEC-188). A closed dialog
// renders nothing, so what the capture holds is its trigger; the dialog itself is
// opened and measured by `tests/e2e/wave15-lead-gallery.spec.ts`, on each ground —
// where it lands INSIDE the scope's element, which is what makes it wear the scope.
// It names no id: Radix generates them.

export function DialogDemo() {
  return (
    <div data-demo="dialog" className="flex flex-wrap items-center gap-4">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" size="md">
            إلغاء الحجز
          </Button>
        </DialogTrigger>
        <DialogContent title="إلغاء حجزك؟" description="سيذهب مقعدك إلى أول من في قائمة الانتظار." closeLabel="إغلاق">
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="quiet" size="md">
                تراجع
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="danger" size="md">
                ألغِ الحجز
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
