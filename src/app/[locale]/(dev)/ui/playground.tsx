import type { ReactNode } from "react";
import { CoinObject } from "@/components/ui/objects/coin";
import { CupObject } from "@/components/ui/objects/cup";
import { FlameObject } from "@/components/ui/objects/flame";
import { RocketObject } from "@/components/ui/objects/rocket";
import { StarObject } from "@/components/ui/objects/star";
import { TicketObject } from "@/components/ui/objects/ticket";
import { PlayScope } from "@/components/ui/scope";
import { PlayWordmark } from "@/components/brand/wordmark";
import { AvatarDemo } from "./demos/avatar";
import { BadgeDemo } from "./demos/badge";
import { CardDemo } from "./demos/card";
import { CheckboxDemo } from "./demos/checkbox";
import { ComboboxDemo } from "./demos/combobox";
import { DataTableDemo } from "./demos/data-table";
import { DateTimeDemo } from "./demos/date-time";
import { EmptyStateDemo } from "./demos/empty-state";
import { FileDropDemo } from "./demos/file-drop";
import { FormSummaryDemo } from "./demos/form-summary";
import { LevelCardDemo } from "./demos/level-card";
import { MenuDemo } from "./demos/menu";
import { PanelDemo } from "./demos/panel";
import { PosterDemo } from "./demos/poster";
import { ProgressDemo } from "./demos/progress";
import { ProgressBarDemo } from "./demos/progress-bar";
import { RaceBarDemo } from "./demos/race-bar";
import { RankRowDemo } from "./demos/rank-row";
import { ReactionBarDemo } from "./demos/reaction-bar";
import { SheetDemo } from "./demos/sheet";
import { StatDemo } from "./demos/stat";
import { StickerDemo } from "./demos/sticker";
import { StoryRingDemo } from "./demos/story-ring";
import { SwitchDemo } from "./demos/switch";
import { TabsDemo } from "./demos/tabs";
import { TagChipDemo } from "./demos/tag-chip";

// «ساحة اللعب» in the gallery — contract 4, DEC-183 §4.2(f), DEC-186 §2.
//
// ★ THIS IS THE ONLY PLACE THE PLAYGROUND IS SEEN IN M17. No screen adopts the
// scope this wave, so the gallery is where a primitive's look inside it is
// reviewed, and `/ar/ui` is in the visual baseline (`scripts/visual-diff.mjs`)
// — which is why the gallery moves on purpose this wave and nothing else does.
//
// Every demo is rendered TWICE, once on each of the scope's grounds. The light
// variant is supported and not the default; a primitive that reads a colour the
// scope does not remap shows up here as ink on ink or paper on paper.
//
// A demo carries no scope of its own (scopes do not nest): its owner writes
// every state from fixture data, and this file decides where it stands.
//
// ★ One writer per file. A demo is its primitive's owner's; the order and the
// titles below are the lead's. A demo is wired in the commit that names it in
// `STATUS.md`'s ledger of what moved `ar_ui`.
//
// ★ NOT WIRED YET, AND WHY. `radio-group` and `code-input` name a radio group
// and element ids, and a demo stands on the page twice (`./ground.ts`): wired as
// they are, the dark ground's radios would lose their checked option to the
// light ground's. They are wired when their demos take `ground`. `date-time`
// has the same fault with two ids and is wired already; its owner has the same
// request. `button`, `field`, `input` and `textarea` wait for contract 5.

const DEMOS: { file: string; title: string; node: ReactNode }[] = [
  { file: "tag-chip", title: "الوسم", node: <TagChipDemo /> },
  { file: "badge", title: "شارة الحالة", node: <BadgeDemo /> },
  { file: "avatar", title: "الصورة الرمزية وحلقة الفريق", node: <AvatarDemo /> },
  { file: "card", title: "البطاقة", node: <CardDemo /> },
  { file: "progress", title: "التقدّم", node: <ProgressDemo /> },
  { file: "progress-bar", title: "شريط التقدّم", node: <ProgressBarDemo /> },
  { file: "empty-state", title: "الحالة الفارغة", node: <EmptyStateDemo /> },
  { file: "stat", title: "الرقم", node: <StatDemo /> },
  { file: "panel", title: "اللوحة", node: <PanelDemo /> },
  { file: "file-drop", title: "رفع الملفات", node: <FileDropDemo /> },
  { file: "sticker", title: "اللاصقة", node: <StickerDemo /> },
  { file: "poster", title: "الملصق", node: <PosterDemo /> },
  { file: "reaction-bar", title: "التفاعلات", node: <ReactionBarDemo /> },
  { file: "story-ring", title: "حلقة القصة", node: <StoryRingDemo /> },
  { file: "checkbox", title: "خانة الاختيار", node: <CheckboxDemo /> },
  { file: "switch", title: "المفتاح", node: <SwitchDemo /> },
  { file: "form-summary", title: "ملخّص الأخطاء", node: <FormSummaryDemo /> },
  { file: "rank-row", title: "صفّ الترتيب", node: <RankRowDemo /> },
  { file: "race-bar", title: "سباق الشركات", node: <RaceBarDemo /> },
  { file: "level-card", title: "بطاقة المستوى", node: <LevelCardDemo /> },
  { file: "data-table", title: "الجدول", node: <DataTableDemo /> },
  { file: "combobox", title: "القائمة القابلة للبحث", node: <ComboboxDemo /> },
  { file: "menu", title: "القائمة المنسدلة", node: <MenuDemo /> },
  { file: "tabs", title: "الألسنة", node: <TabsDemo /> },
  { file: "sheet", title: "الورقة", node: <SheetDemo /> },
  { file: "date-time", title: "التاريخ والوقت", node: <DateTimeDemo /> },
];

function Swatch({ className, name }: { className: string; name: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`size-8 shrink-0 rounded-input border border-edge-strong ${className}`} />
      <span className="text-caption text-fg-muted">{name}</span>
    </li>
  );
}

/** The scope's own values, so a changed token is a changed pixel in the baseline. */
function Tokens() {
  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Swatch className="bg-canvas" name="الأرضية" />
        <Swatch className="bg-surface" name="السطح" />
        <Swatch className="bg-raised" name="المرفوع" />
        <Swatch className="bg-edge" name="الخط (زينة)" />
        <Swatch className="bg-edge-strong" name="حدّ العنصر" />
        <Swatch className="bg-accent" name="الأساسي" />
        <Swatch className="bg-signal" name="الإشارة" />
        <Swatch className="bg-team-neutral" name="فريق بلا لون" />
      </ul>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Swatch className="bg-team-silver" name="فضي" />
        <Swatch className="bg-team-tangerine" name="برتقالي" />
        <Swatch className="bg-team-magenta" name="أرجواني" />
        <Swatch className="bg-team-cyan" name="سماوي" />
        <Swatch className="bg-team-gold" name="ذهبي" />
        <Swatch className="bg-team-violet" name="بنفسجي" />
        <Swatch className="bg-team-mint" name="نعناعي" />
      </ul>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Swatch className="bg-level-1" name="المستوى 1" />
        <Swatch className="bg-level-2" name="المستوى 2" />
        <Swatch className="bg-level-3" name="المستوى 3" />
        <Swatch className="bg-level-4" name="المستوى 4" />
        <Swatch className="bg-level-5" name="المستوى 5" />
      </ul>
      {/* The display face, on the words that break a subsetter: lam-alef, and
          tashkeel stacked on it (REQ-UIX-029, REQ-INT-009). */}
      <div className="flex flex-col gap-2">
        <p className="font-display text-play-lg font-extrabold text-fg-heading">
          <bdi>730</bdi> نقطة
        </p>
        <p className="font-display text-play-md font-extrabold text-fg-heading">لَا إِلَّا الْأُولَى</p>
        <p className="font-display text-play-sm font-extrabold text-accent">كريم معرفة</p>
        <p className="text-body text-fg-body">نصّ الواجهة يبقى على خطّه، والعناوين والأرقام الكبيرة على خطّ العرض.</p>
        <p className="text-caption text-fg-muted">والنصّ الثانوي بهذا اللون.</p>
      </div>
    </div>
  );
}

/** The six objects, and the coin with a computed amount over it — never a baked one. */
function Objects() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <CoinObject size={96} />
        <CoinObject size={96} amount="+50" />
        <CoinObject size={96} amount="+120" />
        <TicketObject size={96} />
        <FlameObject size={96} />
        <CupObject size={96} />
        <StarObject size={96} />
        <RocketObject size={96} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <CoinObject size={48} shadow={false} />
        <FlameObject size={48} shadow={false} />
        <CupObject size={48} shadow={false} />
        <span className="text-caption text-fg-muted">بلا ظلّ، وبحجم 48</span>
      </div>
    </div>
  );
}

function Wordmarks() {
  return (
    <div className="flex flex-col items-start gap-4">
      <PlayWordmark height={28} className="text-accent" />
      <PlayWordmark height={28} className="text-fg-heading" label={null} />
      <PlayWordmark height={56} className="text-fg-heading" label={null} />
    </div>
  );
}

function Block({ title, file, children }: { title: string; file?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-label text-fg-muted">
        {title}
        {file ? (
          <>
            {" · "}
            <bdi dir="ltr" className="text-caption">
              {file}
            </bdi>
          </>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function Ground({ light }: { light?: boolean }) {
  return (
    <PlayScope light={light} className="mt-4 flex flex-col gap-8 rounded-panel p-4 md:p-6">
      <p className="font-display text-play-sm font-extrabold text-fg-heading">{light ? "على الأرضية الفاتحة" : "على الأرضية الداكنة"}</p>
      <Block title="القيم">
        <Tokens />
      </Block>
      <Block title="الشعار" file="brand/wordmark">
        <Wordmarks />
      </Block>
      <Block title="الأشكال الستة" file="objects">
        <Objects />
      </Block>
      {DEMOS.map((d) => (
        <Block key={d.file} title={d.title} file={d.file}>
          {d.node}
        </Block>
      ))}
    </PlayScope>
  );
}

export function Playground() {
  return (
    <>
      <Ground />
      <Ground light />
    </>
  );
}
