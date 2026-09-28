import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { SessionStatusBadge } from "@/components/ui/badge";

// The gallery's `card` demo — contract 4 (DEC-183 §5, DEC-186 §5). Every density
// and media state, from literal fixtures: no DAL, no session, no image from
// storage. The lead renders it inside the playground's scope. A session's
// team-coloured placeholder is `poster`'s demo; this is the generic card.

function Body({ title, meta }: { title: string; meta: string }) {
  return (
    <CardBody>
      <p className="text-label text-fg-heading">
        <bdi>{title}</bdi>
      </p>
      <p className="text-caption text-fg-muted">
        <bdi>{meta}</bdi>
      </p>
    </CardBody>
  );
}

export function CardDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card href="/ar/ui">
          <CardMedia placeholderFrom="لوحة تحكم لا يهجرها أحد" overlay={<SessionStatusBadge phase="open" seat="available" size="sm" />} />
          <Body title="لوحة تحكم لا يهجرها أحد بعد أسبوع" meta="الخميس 6:30 م · قاعة الرياض" />
        </Card>
        <Card href="/ar/ui">
          <CardMedia placeholderFrom="العرض في 5 شرائح" placeholderTone="dark" overlay={<SessionStatusBadge phase="live" size="sm" />} />
          <Body title="العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية" meta="اليوم 6:30 م" />
        </Card>
        <Card>
          <CardMedia placeholderFrom="أتمتة التقارير" dimmed overlay={<SessionStatusBadge phase="ended" size="sm" />} />
          <Body title="أتمتة التقارير الشهرية" meta="انتهت · 12 سبتمبر" />
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <Card density="row" href="/ar/ui">
          <CardMedia placeholderFrom="قيادة الفرق" />
          <Body title="قيادة الفرق عن بعد" meta="الأحد 4:00 م" />
        </Card>
        <Card density="compact">
          <CardMedia placeholderFrom="تصميم" aspect="1/1" />
          <Body title="تصميم الاستبيانات" meta="3 مواد" />
        </Card>
        <Card density="wide" href="/ar/ui">
          <CardMedia placeholderFrom="تحليل البيانات" aspect="16/9" />
          <Body title="تحليل البيانات لغير المتخصصين" meta="الثلاثاء 10:00 ص · 24 مقعدًا متبقيًا" />
        </Card>
      </div>

      <Card>
        <CardBody>
          <p className="text-body text-fg-body">بطاقة بلا وسائط — نص فقط، على سطح النطاق وبحدّه الرفيع.</p>
        </CardBody>
      </Card>
    </div>
  );
}
