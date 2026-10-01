import type { ReactNode } from "react";
import type { MedallionFill } from "@/components/ui";
import { BadgeMedallion } from "@/components/ui/badge-medallion";
import { CalendarIcon, ChartIcon, CheckCircleIcon, StarIcon, UsersIcon } from "@/components/ui/icons";

// `badge-medallion`'s gallery entry — REQ-UIX-064, DEC-213 §5.126, contract 2 (DEC-214).
//
// Literals only: no DAL, no session, no catalogue. The eight seeded badges (`0083:41-58`) at both
// sizes, the five level stops, a plain disc, and a long name on two lines. It carries NO scope of
// its own: the gallery renders it on each of the scope's grounds.

const SEEDED: { name: string; fill: MedallionFill; glyph: ReactNode }[] = [
  { name: "أول حضور", fill: "cyan", glyph: <CheckCircleIcon /> },
  { name: "أول جلسة", fill: "accent", glyph: <UsersIcon /> },
  { name: "صوت مسموع", fill: "accent", glyph: <UsersIcon /> },
  { name: "حاضر دائم", fill: "cyan", glyph: <CalendarIcon /> },
  { name: "سلسلة الشهر", fill: "signal", glyph: <CalendarIcon /> },
  { name: "رأي يُعتد به", fill: "violet", glyph: <ChartIcon /> },
  { name: "مُقدِّم مُقيَّم", fill: "gold", glyph: <StarIcon filled /> },
  { name: "كريم المعرفة السنوي", fill: "bone", glyph: <StarIcon filled /> },
];

const LEVELS = ["مشارِك", "مشارِك نشِط", "صاحب أثر", "كريم معرفة", "سفير المعرفة"];

function State({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      {children}
    </figure>
  );
}

export function BadgeMedallionDemo() {
  // `data-demo` is the handle a gallery spec captures by.
  return (
    <div data-demo="badge-medallion" className="flex flex-col gap-8">
      <State title="الشارات الثماني، 64 بكسل، بعلامتها">
        <ul className="flex flex-wrap gap-3">
          {SEEDED.map((b) => (
            <li key={b.name}>
              <BadgeMedallion name={b.name} fill={b.fill} glyph={b.glyph} />
            </li>
          ))}
        </ul>
      </State>
      <State title="الرف على سطح المكتب، 52 بكسل، قرص بلا علامة">
        <ul className="flex flex-wrap gap-2">
          {SEEDED.slice(0, 5).map((b) => (
            <li key={b.name}>
              <BadgeMedallion name={b.name} fill={b.fill} size="sm" />
            </li>
          ))}
        </ul>
      </State>
      <State title="درجات المستوى الخمس، بجانب اسم مرسوم">
        <ul className="flex flex-wrap gap-4">
          {LEVELS.map((name, i) => (
            <li key={name} className="flex items-center gap-2">
              <BadgeMedallion name={name} fill={{ level: i + 1 }} glyph={<StarIcon filled />} showName={false} />
              <span className="font-display font-extrabold text-fg-heading">
                <bdi>{name}</bdi>
              </span>
            </li>
          ))}
        </ul>
      </State>
      <State title="اسم طويل على سطرين">
        <BadgeMedallion name="شارة طويلة الاسم غيّرتها المؤسسة" fill="gold" glyph={<StarIcon filled />} />
      </State>
    </div>
  );
}
