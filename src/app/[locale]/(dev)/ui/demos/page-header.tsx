import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Prose } from "@/components/ui/prose";
import { SectionHeader } from "@/components/ui/section-header";

// The gallery's demo of the three type primitives — `page-header`,
// `section-header` and `prose` — contract 4. They name only context variables, so
// the scope reaches them with no class of its own (DEC-186 §2, mechanism A), and
// this is where that is seen rather than assumed.
//
// ★ The titles keep the face they have. `02-typography.md` gives «headings» to the
// display face on one line and `title` to the body face on another; which wins is
// the owner's, asked with the first screen (STATUS, carried).

export function PageHeaderDemo() {
  return (
    <div data-demo="page-header" className="flex flex-col gap-8">
      <PageHeader
        eyebrow="الجلسات"
        title="لوحة تحكم لا يهجرها أحد بعد أسبوع"
        description="الخميس 6:30 م · قاعة الرياض · 18 من 40 مقعدًا"
        breadcrumb={[
          { href: "/app", label: "الرئيسية" },
          { href: "/app/sessions", label: "الجلسات" },
        ]}
        breadcrumbLabel="مسار الصفحة"
        status={<Badge tone="success">التسجيل مفتوح</Badge>}
        actions={
          <Button variant="primary" size="md">
            احجز مقعدك
          </Button>
        }
      />
      <SectionHeader title="المواد" count={3} description="تُفتح بعد انتهاء الجلسة." />
      <SectionHeader as="h3" title="النقاش" />
      <Prose>
        <p>تبدأ الجلسة بعرض قصير، ثم نفتح النقاش. أحضر حاسوبك إن أردت أن تجرّب ما نعرضه.</p>
        <p>
          المواد في <a href="#top">صفحة الجلسة</a> بعد انتهائها.
        </p>
        <ul>
          <li>عرض من 5 شرائح</li>
          <li>نقاش مفتوح</li>
        </ul>
      </Prose>
    </div>
  );
}
