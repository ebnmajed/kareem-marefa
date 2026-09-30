import type { ReactElement } from "react";
import * as Icons from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";

// The gallery's `icons` demo — wave 17, contract 3 (DEC-199 §3, REQ-UIX-052).
//
// ★ IT READS THE MODULE, NOT A LIST. Every export of `ui/icons` whose name ends
// in «Icon» is drawn, so a glyph added to the file is in the gallery the same
// day, under its export name. Wave 6 added four and a typed count went stale.
//
// Two tables below are keyed by export name, and both are ADDITIVE: a glyph
// missing from either is still drawn, it only loses a caption or a second form.
//   · `NAMES` — the Arabic word DEC-079 asks for. The name is how a teammate
//     finds the right glyph; the export name stands beside it, always.
//   · `FORMS` — what a glyph draws from a PROP, which enumeration cannot see:
//     the four directions, and the filled face.
//
// Each glyph at the body size and at the display size: `1em` and `currentColor`
// are the whole contract, and both are seen here.

type Glyph = (props: { className?: string; label?: string; direction?: string; filled?: boolean }) => ReactElement;

const GLYPHS = Object.entries(Icons as unknown as Record<string, unknown>)
  .filter((entry): entry is [string, Glyph] => entry[0].endsWith("Icon") && typeof entry[1] === "function")
  .sort(([a], [b]) => a.localeCompare(b, "en"));

const NAMES: Record<string, string> = {
  AlertCircleIcon: "خطأ",
  AlertTriangleIcon: "تحذير",
  ArrowIcon: "سهم",
  BellIcon: "الإشعارات",
  BoltIcon: "برق",
  BookmarkFilledIcon: "محفوظ",
  BookmarkIcon: "حفظ",
  BuildingIcon: "شركة",
  CalendarCheckIcon: "في تقويمك",
  CalendarIcon: "تقويم",
  CameraIcon: "كاميرا",
  ChartIcon: "مؤشرات",
  CheckCircleIcon: "مؤكَّد",
  CheckIcon: "تم",
  ChevronIcon: "شيفرون",
  ClockIcon: "وقت",
  CloseIcon: "إغلاق",
  CoinIcon: "نقاط",
  CommentIcon: "تعليقات",
  CompassIcon: "استكشف",
  DotIcon: "نقطة",
  DownloadIcon: "تنزيل",
  EyeIcon: "رؤية",
  FilterIcon: "تصفية",
  FlameIcon: "سلسلة",
  GearIcon: "إعدادات",
  HeartIcon: "إعجاب",
  HomeIcon: "الرئيسية",
  ImageIcon: "صورة",
  InfoIcon: "معلومة",
  LineIcon: "خط",
  LinkIcon: "رابط",
  LockIcon: "مقفل",
  MegaphoneIcon: "إعلان",
  MenuIcon: "قائمة",
  MoreIcon: "المزيد",
  PaletteIcon: "هوية",
  PauseIcon: "إيقاف مؤقت",
  PinIcon: "مكان",
  PlusIcon: "إضافة",
  SearchIcon: "بحث",
  ShareIcon: "مشاركة",
  SortIcon: "ترتيب",
  SpinnerIcon: "تحميل",
  StarIcon: "تقييم",
  TagIcon: "وسم",
  TicketIcon: "حجز",
  TrashIcon: "حذف",
  TrophyIcon: "كأس",
  UploadIcon: "رفع",
  UserIcon: "عضو",
  UsersIcon: "حضور",
};

const DIRECTIONS = [{ direction: "forward" }, { direction: "back" }, { direction: "up" }, { direction: "down" }];
const FILLED = [{ filled: false }, { filled: true }];

const FORMS: Record<string, { direction?: string; filled?: boolean }[]> = {
  ArrowIcon: DIRECTIONS,
  ChevronIcon: DIRECTIONS,
  BoltIcon: FILLED,
  FlameIcon: FILLED,
  HeartIcon: FILLED,
  StarIcon: FILLED,
};

export function IconsDemo() {
  return (
    <div data-demo="icons" data-count={GLYPHS.length}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {GLYPHS.map(([name, G]) => {
          // The spinner is the one glyph whose name is required.
          const label = name === "SpinnerIcon" ? (NAMES[name] ?? name) : undefined;
          const forms = FORMS[name] ?? [{}];
          return (
            <li key={name} data-glyph={name}>
              <Panel className="flex h-full flex-col items-center gap-2 text-center">
                <span className="flex flex-wrap items-end justify-center gap-2 text-body text-fg-heading">
                  {forms.map((form, i) => (
                    <G key={i} label={label} {...form} />
                  ))}
                </span>
                <span className="flex flex-wrap items-end justify-center gap-2 text-play-md text-fg-heading">
                  {forms.map((form, i) => (
                    <G key={i} label={label} {...form} />
                  ))}
                </span>
                {NAMES[name] ? <span className="text-caption text-fg-heading">{NAMES[name]}</span> : null}
                <bdi dir="ltr" className="text-caption break-all text-fg-muted">
                  {name}
                </bdi>
              </Panel>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
