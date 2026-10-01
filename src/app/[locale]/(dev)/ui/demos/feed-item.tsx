import { FeedItem } from "@/components/ui/feed-item";
import { FlameIcon, StarIcon } from "@/components/ui/icons";

// The gallery's `feed-item` demo — REQ-UIX-057, DEC-207 §3. Every variant and state, in Arabic, from literal
// fixtures: no DAL, no session, no image from storage (the recap's tiles are data URIs of one flat colour — a
// photograph is not the point here, its box is). Rendered inside the playground's scope by the gallery.

const TILE = (shade: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${shade}"/></svg>`)}`;

// Three greys, so three tiles are told apart; not a colour of the product's.
const PHOTOS = [TILE("rgb(58,63,86)"), TILE("rgb(44,61,74)"), TILE("rgb(74,58,46)")].map((src, i) => ({ src, alt: `صورة ${i + 1} من الجلسة`, width: 4, height: 4 }));

export function FeedItemDemo() {
  return (
    <div data-demo="feed-item" className="flex max-w-[600px] flex-col gap-3">
      <FeedItem variant="achievement" icon={<StarIcon />} context="أيك" time="قبل ساعتين">
        <bdi className="font-bold text-fg-heading">فهد العنزي</bdi> نال شارة <b><bdi>أول حضور</bdi></b>
      </FeedItem>
      <FeedItem variant="achievement" icon={<FlameIcon />} time="أمس">
        أكملت سلسلة الحضور في <bdi>سبتمبر</bdi>
      </FeedItem>

      <FeedItem variant="announcement" sourceLabel="إعلان من الإدارة" time="أمس" body="موسم الشتاء يبدأ 12 أكتوبر: ثلاث جلسات كل أسبوع، والكأس يُسلَّم في اللقاء السنوي." />
      <FeedItem
        variant="announcement"
        sourceLabel="إعلان من الإدارة"
        time="قبل 3 أيام"
        body={"إعلان طويل لا يُقصّ: تتغيّر قاعة الرياض إلى القاعة الكبرى ابتداءً من الأسبوع القادم، لأن عدد الحضور تجاوز سعتها ثلاث مرات متتالية.\nالمواعيد لا تتغيّر، والتسجيل كما هو."}
      />

      <FeedItem
        variant="recap"
        title="الأرقام التي تكذب"
        href="/ui"
        doneLabel="اكتملت"
        time="أمس"
        meta={<>محمد الدوسري، جذر · 28 حاضرًا، 3 صور</>}
        photos={PHOTOS}
        materials={{ href: "/ui", label: "المواد" }}
      />
      <FeedItem variant="recap" title="تصميم الاستبيانات" href="/ui" doneLabel="اكتملت" time="قبل يومين" meta={<>نورة العتيبي · صورة واحدة</>} photos={PHOTOS.slice(0, 1)} />
      <FeedItem variant="recap" title="أتمتة التقارير" href="/ui" doneLabel="اكتملت" time="قبل 5 أيام" meta={<>فهد العنزي، أيك</>} photos={[]} materials={{ href: "/ui", label: "المواد" }} />
    </div>
  );
}
