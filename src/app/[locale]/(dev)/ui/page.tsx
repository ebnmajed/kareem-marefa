import { setRequestLocale } from "next-intl/server";
import * as Icons from "@/components/ui/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardMedia } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { TagChip } from "@/components/ui/tag-chip";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/stat";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { SESSION_PHASES, type SeatState } from "@/lib/session-status";

// The component gallery — `16` §4.3, DEC-083, REQ-UIX-001.
//
// It is NOT decoration. It is three things at once:
//   · where the 390 px RTL review happens, for primitives that have no screen
//     of their own yet;
//   · where `npm run visual` takes the design system's regression baseline —
//     which is the reason it is unauthenticated: `scripts/visual-diff.mjs`
//     drives a browser at public URLs and has no auth path at all;
//   · where a teammate checks whether a primitive already EXISTS before
//     writing a twenty-first input.
//
// ★★ It lives in `(dev)`, not `/app/admin/ui`, for two concrete reasons found
// while stress-testing this plan. `app/admin/**` is `console`'s (DEC-048), so a
// lead-owned gallery under it is an ownership collision on day one. And an
// admin-gated route is simply not capturable by the harness we have, so "the
// gallery visual baseline" would have been a gate that could never run.
//
// ★ It is gated at the EDGE, in `proxy.ts`: 404 unless `KAREEM_GALLERY=1`,
// which `visual-diff.mjs` sets when it spawns `next start`. `NODE_ENV` cannot
// do this job — `stubbed-server.mjs` serves the production build, so a route
// excluded from that build makes `npm run visual` 404 and one included in it is
// public on the live domain.
//
// It reads NO DATA. Every value below is a literal, which is what makes it
// deterministic enough to diff.

export const metadata = { robots: { index: false, follow: false } };

const SEATS: SeatState[] = ["available", "full", "closed", "unlimited"];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <SectionHeader title={title} as="h2" />
      <div className="mt-4 flex flex-wrap items-end gap-4">{children}</div>
    </section>
  );
}

export default async function GalleryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <PageHeader title="نظام التصميم" eyebrow="dev" description="كل عنصر من عناصر الواجهة، بكل حالاته." />

      <Row title="الأزرار">
        <Button variant="primary">احجز مقعدًا</Button>
        <Button variant="secondary">إلغاء الحجز</Button>
        <Button variant="ghost">المزيد</Button>
        <Button variant="danger">حذف</Button>
        <Button variant="primary" size="md">
          متوسط
        </Button>
        <Button variant="primary" size="sm">
          صغير
        </Button>
        <Button variant="primary" pending pendingLabel="جارٍ الحفظ">
          جارٍ الحفظ
        </Button>
        <Button variant="primary" disabled>
          معطّل
        </Button>
        <ButtonLink href="/app" variant="secondary">
          رابط كزر
        </ButtonLink>
      </Row>

      <Row title="حالة الجلسة">
        {SESSION_PHASES.map((phase) => (
          <SessionStatusBadge key={phase} phase={phase} />
        ))}
        {SEATS.map((seat) => (
          <SessionStatusBadge key={seat} phase="open" seat={seat} />
        ))}
        <SessionStatusBadge phase="open" seat="available" closingSoon />
      </Row>

      <Row title="الشارات">
        <Badge tone="neutral">محايد</Badge>
        <Badge tone="info">معلومة</Badge>
        <Badge tone="success">نجاح</Badge>
        <Badge tone="live">جارٍ</Badge>
        <Badge tone="ended">انتهى</Badge>
        <Badge tone="error">خطأ</Badge>
        <Badge outline>مسودة</Badge>
      </Row>

      <Row title="الوسوم">
        <TagChip label="تقارير" href="/app/sessions?tag=reports" />
        <TagChip label="أتمتة" count={12} />
        <TagChip label="إكسل" removeLabel="أزل الوسم: إكسل" onRemove={undefined} />
      </Row>

      <Row title="الصور الرمزية">
        {([24, 32, 34, 40, 56, 96, 160] as const).map((size) => (
          <Avatar key={size} memberId={`m-${size}`} displayName="ريم العتيبي" size={size} />
        ))}
        <Avatar memberId="m-none" displayName={null} size={56} />
      </Row>

      <Row title="التقدّم والأرقام">
        <div className="w-64">
          <Progress value={42} max={60} label="المقاعد المحجوزة" valueText="٤٢ من ٦٠" />
        </div>
        <Stat label="الحضور" value="١٢٤" hint="هذا الشهر" />
        <Stat label="الجلسات" value="١٨" href="/app/sessions" />
      </Row>

      <Row title="الأسطح">
        <Panel>لوحة عادية</Panel>
        <Panel tone="error">لوحة خطأ</Panel>
        <div className="w-64">
          <Card>
            <CardMedia placeholderFrom="عنوان الجلسة" aspect="4/5" />
            <CardBody>عنوان الجلسة</CardBody>
          </Card>
        </div>
      </Row>

      <Row title="الحالة الفارغة">
        <div className="w-full max-w-md">
          <EmptyState
            title="لا جلسات بعد"
            description="ابدأ باقتراح موضوع تودّ أن تسمعه."
            action={{ label: "اقترح موضوعًا", href: "/app/propose" }}
          />
        </div>
      </Row>

      <Row title="الهياكل">
        <div className="w-full max-w-md">
          <SkeletonPageHeader />
          <Skeleton variant="card" className="mt-4" />
          <Skeleton variant="row" count={2} className="mt-3" />
        </div>
      </Row>

      <section className="mt-10">
        <SectionHeader title="الأيقونات" as="h2" description="٣٤ رمزًا، بخط واحد، مرسومة لهذا المنتج." />
        <ul className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-8">
          {Object.entries(Icons)
            .filter(([name]) => name.endsWith("Icon"))
            .map(([name, Glyph]) => {
              const G = Glyph as (p: { className?: string; label?: string }) => React.ReactElement;
              return (
                <li key={name} className="flex flex-col items-center gap-2 rounded-field border border-edge p-3">
                  {/* Each at three sizes, so weight drift between them is
                      visible rather than inferred. The spinner needs a label. */}
                  <span className="flex items-end gap-2 text-fg-heading">
                    <G className="text-[1rem]" label={name === "SpinnerIcon" ? "تحميل" : undefined} />
                    <G className="text-[1.25rem]" label={name === "SpinnerIcon" ? "تحميل" : undefined} />
                    <G className="text-[1.5rem]" label={name === "SpinnerIcon" ? "تحميل" : undefined} />
                  </span>
                  <code className="text-caption text-fg-muted">{name.replace(/Icon$/, "")}</code>
                </li>
              );
            })}
        </ul>
      </section>

      {/* The dark band, because the brand's rhythm is per SECTION and half the
          system has to work on it (DEC-080): the event page's hero, the studio
          previews, the certificate preview. */}
      <section className="theme-dark mt-10 rounded-card bg-canvas p-6">
        <SectionHeader title="على الخلفية الداكنة" as="h2" />
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Button variant="primary">احجز مقعدًا</Button>
          <Button variant="secondary">إلغاء</Button>
          {SESSION_PHASES.map((phase) => (
            <SessionStatusBadge key={phase} phase={phase} />
          ))}
          <Avatar memberId="m-dark" displayName="ريم العتيبي" size={40} />
        </div>
      </section>
    </div>
  );
}
