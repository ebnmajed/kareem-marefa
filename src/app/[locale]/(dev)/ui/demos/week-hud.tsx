import type { WeekHudProps } from "@/components/ui";
import { WeekHud } from "@/components/ui/week-hud";

// `week-hud`'s gallery entry — REQ-UIX-057, contract 2 (DEC-206, DEC-207).
//
// Literals only: no DAL, no session, no catalogue. Every state, from fixtures, in
// Arabic. It carries NO scope of its own: `playground.tsx` renders it on each ground.
// ★ No state draws a zero where there is an absence: an unranked member has words,
// an org with no streak rule has no streak tile.

const LABEL = "حصيلتك هذا الشهر";
const BOARD = "/app/leaderboards?board=month";

const RANKED: WeekHudProps["rank"] = { label: "ترتيب سبتمبر", value: "#4", valueLabel: "المرتبة 4 من 212 في سبتمبر", href: BOARD };
const STREAK: WeekHudProps["streak"] = { label: "سلسلتك بالأشهر", value: "×7", valueLabel: "سلسلة 7 أشهر متتالية" };
const POINTS: WeekHudProps["points"] = { label: "نقاطك", value: "680", valueLabel: "رصيدك 680 نقطة", href: "/app/me/points" };
const LEVEL: WeekHudProps["level"] = { value: 680, max: 700, line: "بقيت 20 نقطة لمستوى كريم معرفة" };

const STATES: Array<{ title: string; props: WeekHudProps }> = [
  { title: "مرتَّب، وتقدّم منذ زيارته الأخيرة", props: { label: LABEL, rank: { ...RANKED, movement: { riseLabel: "تقدّمت 3 مراكز منذ زيارتك الأخيرة" } }, streak: STREAK, points: { ...POINTS, delta: "+20", deltaLabel: "20 نقطة جديدة منذ زيارتك الأخيرة" }, level: LEVEL } },
  { title: "مخفيّ عن اللوحات: يرى ترتيبه وحده", props: { label: LABEL, rank: { ...RANKED, label: "ترتيبك · مخفيّ عن غيرك" }, streak: STREAK, points: POINTS, level: LEVEL } },
  { title: "بلا نقاط هذا الشهر — لا ترتيب بعد", props: { label: LABEL, rank: { label: "ترتيب أكتوبر", absent: "لا ترتيب بعد", href: BOARD }, streak: { label: "سلسلتك بالأشهر", absent: "لم تبدأ بعد" }, points: { ...POINTS, value: "0", valueLabel: "رصيدك صفر نقطة" }, level: { value: 0, max: 100, line: "بقيت 100 نقطة لمستوى مشارِك نشِط" } } },
  { title: "لا لوحة شهرية بعد", props: { label: LABEL, rank: { label: "ترتيبك", absent: "يُحسب الليلة" }, streak: STREAK, points: POINTS, level: { line: "يُحدَّد مستواك في التقييم الليلي القادم." } } },
  { title: "سلاسل الحضور مطفأة — بطاقتان", props: { label: LABEL, rank: RANKED, streak: null, points: POINTS, level: LEVEL } },
  { title: "أعلى مستوى", props: { label: LABEL, rank: { ...RANKED, value: "#1", valueLabel: "المرتبة 1 من 212 في سبتمبر" }, streak: STREAK, points: { ...POINTS, value: "1,640", valueLabel: "رصيدك 1,640 نقطة" }, level: { value: 1, max: 1, line: "بلغت أعلى مستوى" } } },
  { title: "مرتبة من أربعة أرقام، وشهر طويل الاسم", props: { label: LABEL, rank: { ...RANKED, label: "ترتيب ديسمبر", value: "#1,204", valueLabel: "المرتبة 1,204 من 1,310 في ديسمبر" }, streak: { ...STREAK, value: "×12", valueLabel: "سلسلة 12 شهرًا متتاليًا" }, points: { ...POINTS, value: "12,480", valueLabel: "رصيدك 12,480 نقطة" }, level: LEVEL } },
];

export function WeekHudDemo() {
  return (
    <div data-demo="week-hud" className="flex flex-col gap-6">
      {STATES.map((s) => (
        <figure key={s.title} className="flex max-w-[390px] flex-col gap-2">
          <figcaption className="text-caption text-fg-muted">{s.title}</figcaption>
          <WeekHud {...s.props} />
        </figure>
      ))}
    </div>
  );
}
