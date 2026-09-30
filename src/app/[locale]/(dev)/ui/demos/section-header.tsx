import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";

// The gallery's `section-header` demo — wave 17, contract 3 (DEC-199 §3, §5.26).
// An `h2` in the display face and an `h3` in the body face, each alone and with
// what the props add: the count, the description, the actions — and all of them
// under a title long enough to wrap at 390 px.

export function SectionHeaderDemo() {
  return (
    <div data-demo="section-header" className="flex flex-col gap-8">
      <SectionHeader title="المواد" />
      <SectionHeader title="هذا الأسبوع" count={3} />
      <SectionHeader title="النقاش" description="يُفتح بعد انتهاء الجلسة، ويبقى مفتوحًا أسبوعين." />
      <SectionHeader
        title="الصور"
        count={12}
        actions={
          <Button variant="quiet" size="md">
            تنزيل الكل
          </Button>
        }
      />
      <SectionHeader
        title="المهام المطلوبة قبل اليوم الثاني من الورشة"
        count={128}
        description="أنجزها قبل بداية اليوم، وارفع ما يُطلب منك في كل مهمة."
        actions={
          <Button variant="quiet" size="md">
            أضف مهمة
          </Button>
        }
      />
      <SectionHeader as="h3" title="اليوم الأول" />
      <SectionHeader as="h3" title="اليوم الثاني" count={4} description="الأحد 9:00 ص · قاعة الرياض" />
    </div>
  );
}
