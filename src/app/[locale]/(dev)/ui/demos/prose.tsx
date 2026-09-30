import type { ProseProps } from "@/components/ui";
import { Prose } from "@/components/ui/prose";

// The gallery's `prose` demo — wave 17, contract 3 (DEC-199 §3, §5.25). Both
// sizes, each with everything the rhythm names: paragraphs, an `h2`, an `h3`,
// both lists, a link, a Latin run and a figure inside the Arabic, and a line
// with full tashkeel — the line height holds it and nothing clips it.

const SIZES: NonNullable<ProseProps["size"]>[] = ["md", "sm"];

export function ProseDemo() {
  return (
    <div data-demo="prose" className="flex flex-col gap-8">
      {SIZES.map((size) => (
        <Prose key={size} size={size}>
          <p>تبدأ الجلسة بعرض قصير، ثم نفتح النقاش. أحضر حاسوبك إن أردت أن تجرّب ما نعرضه.</p>
          <p>
            المواد في <a href="#top">صفحة الجلسة</a> بعد انتهائها، ومعها تسجيل من 45 دقيقة.
          </p>
          <h2>ما الذي نغطّيه</h2>
          <p>
            نبني لوحة في <bdi>Looker Studio</bdi> من 3 مصادر، ونقيس ما يبقى منها بعد أسبوع.
          </p>
          <ul>
            <li>عرض من 5 شرائح</li>
            <li>تمرين عملي</li>
            <li>نقاش مفتوح</li>
          </ul>
          <h3>قبل أن تحضر</h3>
          <ol>
            <li>احجز مقعدك.</li>
            <li>نزّل ملف البيانات.</li>
          </ol>
          <p>الْعِلْمُ يُؤْتَى وَلَا يَأْتِي، وَمَنْ جَدَّ وَجَدَ.</p>
        </Prose>
      ))}
    </div>
  );
}
