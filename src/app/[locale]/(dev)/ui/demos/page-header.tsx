import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { TagChip } from "@/components/ui/tag-chip";

// The gallery's `page-header` demo — contract 3 of wave 17 (DEC-199 §3, §5.26).
// The page's one `h1`, in the display face inside the scope. Four headers, from
// the least a page passes to the most: the title alone; a breadcrumb and a
// description; everything at once; and a long title that begins with a Latin
// word, which must not reorder the chevron beside it.
//
// ★ A page has ONE `h1` and this demo draws four, on a page that has its own.
// The gallery is the one place that is right: it shows the primitive, not a page.

const CRUMBS = [
  { href: "/ui", label: "الرئيسية" },
  { href: "/ui", label: "الجلسات" },
];

export function PageHeaderDemo() {
  return (
    <div data-demo="page-header" className="flex flex-col gap-10">
      <PageHeader title="نقاطي" />
      <PageHeader
        title="المواد"
        description="كل ما رُفع لهذه الجلسة، مرتّبًا حسب اليوم."
        breadcrumb={[...CRUMBS, { href: "/ui", label: "ورشة القياس" }]}
        breadcrumbLabel="مسار الصفحة"
      />
      <PageHeader
        eyebrow="الجلسات"
        title="لوحة تحكم لا يهجرها أحد بعد أسبوع"
        description="الخميس 6:30 م · قاعة الرياض · 18 من 40 مقعدًا"
        breadcrumb={CRUMBS}
        breadcrumbLabel="مسار الصفحة"
        status={<Badge tone="success">التسجيل مفتوح</Badge>}
        meta={
          <>
            <TagChip label="تحليل البيانات" />
            <TagChip label="متوسط" />
            <TagChip label="90 دقيقة" />
          </>
        }
        actions={
          <Button variant="primary" size="md">
            احجز مقعدك
          </Button>
        }
      />
      <PageHeader
        eyebrow="ورشة من 3 أيام"
        title="Figma للمبتدئين: من الإطار الأول إلى نموذج يعمل على الهاتف"
        description="تبدأ الأحد 9:00 ص"
        actions={
          <>
            <Button variant="secondary" size="md">
              أضف إلى التقويم
            </Button>
            <Button variant="primary" size="md">
              احجز مقعدك
            </Button>
          </>
        }
      />
    </div>
  );
}
