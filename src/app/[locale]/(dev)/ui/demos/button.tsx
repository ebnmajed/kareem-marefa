import type { ButtonVariant, Size } from "@/components/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChevronIcon, PlusIcon } from "@/components/ui/icons";

// The gallery's `button` demo — wave 17, contract 3 (DEC-199 §3, REQ-UIX-051).
// Every variant at every size, then each state the props name: pending with the
// label kept (REQ-UIX-007), disabled, the two icon slots, the trailing slot, a
// label too long for one line, the full width, and `ButtonLink`. Literals only.

const VARIANTS: { variant: ButtonVariant; label: string }[] = [
  { variant: "primary", label: "احجز مقعدك" },
  { variant: "secondary", label: "أضف إلى التقويم" },
  { variant: "ghost", label: "تراجع" },
  { variant: "danger", label: "احذف الجلسة" },
  { variant: "signal", label: "سجّل حضورك" },
  { variant: "quiet", label: "عرض الكل" },
];

const SIZES: Size[] = ["lg", "md", "sm"];

export function ButtonDemo() {
  return (
    <div data-demo="button" className="flex flex-col gap-6">
      {SIZES.map((size) => (
        <div key={size} data-size={size} className="flex flex-wrap items-center gap-3">
          {VARIANTS.map(({ variant, label }) => (
            <Button key={variant} variant={variant} size={size}>
              {label}
            </Button>
          ))}
        </div>
      ))}

      <div data-state="pending" className="flex flex-wrap items-center gap-3">
        <Button pending pendingLabel="جارٍ الحجز…">
          احجز مقعدك
        </Button>
        <Button variant="secondary" size="md" pending>
          حفظ
        </Button>
        <Button variant="quiet" size="md" pending pendingLabel="جارٍ التحميل…">
          عرض الكل
        </Button>
      </div>

      <div data-state="disabled" className="flex flex-wrap items-center gap-3">
        {VARIANTS.map(({ variant, label }) => (
          <Button key={variant} variant={variant} size="md" disabled>
            {label}
          </Button>
        ))}
      </div>

      <div data-state="icons" className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="md" iconStart={<PlusIcon />}>
          اقترح جلسة
        </Button>
        <Button variant="quiet" size="md" iconEnd={<ChevronIcon direction="forward" />}>
          التالي
        </Button>
        <Button variant="ghost" size="md" iconStart={<ChevronIcon direction="back" />}>
          السابق
        </Button>
      </div>

      <div data-state="trailing" className="flex max-w-sm flex-col gap-3">
        <Button trailing={<span className="text-caption">18 من 40</span>}>احجز مقعدك</Button>
        <Button variant="signal" trailing={<span className="text-caption">يغلق 7:15 م</span>}>
          سجّل حضورك
        </Button>
        <Button className="w-full">احجز مقعدك</Button>
      </div>

      {/* The narrowest a call to action stands in: 390 px less the page's and a card's gutters. */}
      <div data-state="long" className="flex max-w-[20.375rem] flex-col gap-3">
        <Button trailing={<span className="text-caption">بقي مقعدان</span>}>انضم إلى قائمة الانتظار لهذه الجلسة</Button>
      </div>

      <div data-state="link" className="flex flex-wrap items-center gap-3">
        <ButtonLink href="/ui">تصفّح الجلسات</ButtonLink>
        <ButtonLink href="/ui" variant="secondary" size="md">
          كل المواد
        </ButtonLink>
        <ButtonLink href="/ui" variant="quiet" size="md" trailing={<ChevronIcon direction="forward" />}>
          لوحة المتصدرين
        </ButtonLink>
      </div>
    </div>
  );
}
