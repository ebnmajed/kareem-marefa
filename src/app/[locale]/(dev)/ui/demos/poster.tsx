import { Poster } from "@/components/ui/poster";
import { Sticker } from "@/components/ui/sticker";

// The gallery's `poster` demo — contract 4 (DEC-183 §5, DEC-186 §5,
// REQ-UIX-032). The placeholder in each of the seven team colours and with
// none, with and without a sticker, and a long title. From literal fixtures;
// the lead renders it inside the playground's scope. The rendered-image state
// needs an artifact, and the gallery reads no storage: it is covered by the
// jsdom test, and it is `CardMedia`'s own whole-image path.

const TEAMS = [
  { teamName: "شبه الجزيرة", teamColor: "#E9E4D6", title: "كيف تكتب ملخصًا تنفيذيًا في صفحة واحدة", category: "كتابة" },
  { teamName: "صنف", teamColor: "#FF9A2E", title: "لوحة تحكم لا يهجرها أحد بعد أسبوع", category: "جلسة إدارية" },
  { teamName: "بنينسولا ستوري", teamColor: "#FF4FB8", title: "القصة قبل الشرائح", category: "عرض" },
  { teamName: "مواهب", teamColor: "#35D0FF", title: "العرض في 5 شرائح: كيف تُقنع اللجنة التنفيذية", category: "قيادة" },
  { teamName: "دبابيس", teamColor: "#FFD23F", title: "أتمتة التقارير الشهرية", category: "تقنية" },
  { teamName: "أيك", teamColor: "#9B7CFF", title: "تصميم الاستبيانات", category: "بحث" },
  { teamName: "جذر", teamColor: "#3BE8B0", title: "تحليل البيانات لغير المتخصصين", category: "بيانات" },
] as const;

export function PosterDemo() {
  return (
    <div data-demo="poster" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TEAMS.map((team, i) => (
          <Poster
            key={team.teamName}
            {...team}
            date="2 أكتوبر، 6:30 م"
            sticker={i === 1 ? <Sticker size="sm">محجوز</Sticker> : i === 3 ? <Sticker size="sm" fill="bone" rotate={4}>+50</Sticker> : undefined}
          />
        ))}
        <Poster title="جلسة من شركة بلا لون" teamName="شركة بلا لون" teamColor={null} category="عام" date="5 أكتوبر، 4:00 م" />
      </div>

      <div className="max-w-60">
        <Poster
          title="عنوان طويل جدًا يمتد على أسطر كثيرة ليختبر كيف يتوازن النص ويُقصّ على حاويته لا على السطر، مع الحركات: مُعَلِّمٌ وَمُتَعَلِّم"
          teamName="أيك"
          teamColor="#9B7CFF"
          category="اختبار"
        />
      </div>
    </div>
  );
}
