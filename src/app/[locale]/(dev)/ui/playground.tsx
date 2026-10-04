import type { ReactNode } from "react";
import { CoinObject } from "@/components/ui/objects/coin";
import { CupObject } from "@/components/ui/objects/cup";
import { FlameObject } from "@/components/ui/objects/flame";
import { RocketObject } from "@/components/ui/objects/rocket";
import { StarObject } from "@/components/ui/objects/star";
import { TicketObject } from "@/components/ui/objects/ticket";
import { PageHeader } from "@/components/ui/page-header";
import { PlayScope } from "@/components/ui/scope";
import { PlayWordmark } from "@/components/brand/wordmark";
import { ActionBarDemo } from "./demos/action-bar";
import { AttendeeStackDemo } from "./demos/attendee-stack";
import { AvatarDemo } from "./demos/avatar";
import { BadgeDemo } from "./demos/badge";
import { ButtonDemo } from "./demos/button";
import { CardDemo } from "./demos/card";
import { CheckboxDemo } from "./demos/checkbox";
import { CodeInputDemo } from "./demos/code-input";
import { ComboboxDemo } from "./demos/combobox";
import { DataTableDemo } from "./demos/data-table";
import { DateTimeDemo } from "./demos/date-time";
import { DialogDemo } from "./demos/dialog";
import { EmptyStateDemo } from "./demos/empty-state";
import { FeedItemDemo } from "./demos/feed-item";
import { FieldDemo } from "./demos/field";
import { FileDropDemo } from "./demos/file-drop";
import { FormSummaryDemo } from "./demos/form-summary";
import { IconButtonDemo } from "./demos/icon-button";
import { IconsDemo } from "./demos/icons";
import { InputDemo } from "./demos/input";
import { LevelCardDemo } from "./demos/level-card";
import { LinkDemo } from "./demos/link";
import { MenuDemo } from "./demos/menu";
import { PageHeaderDemo } from "./demos/page-header";
import { PanelDemo } from "./demos/panel";
import { PosterDemo } from "./demos/poster";
import { ProgressDemo } from "./demos/progress";
import { ProgressBarDemo } from "./demos/progress-bar";
import { ProseDemo } from "./demos/prose";
import { RadioGroupDemo } from "./demos/radio-group";
import { RaceBarDemo } from "./demos/race-bar";
import { RankRowDemo } from "./demos/rank-row";
import { ReactionBarDemo } from "./demos/reaction-bar";
import { ReorderableListDemo } from "./demos/reorderable-list";
import { RouteErrorDemo } from "./demos/route-error";
import { RouteProgressDemo } from "./demos/route-progress";
import { SectionHeaderDemo } from "./demos/section-header";
import { SelectDemo } from "./demos/select";
import { SessionCtaDemo } from "./demos/session-cta";
import { SheetDemo } from "./demos/sheet";
import { SkeletonDemo } from "./demos/skeleton";
import { StatDemo } from "./demos/stat";
import { StickerDemo } from "./demos/sticker";
import { StoryRingDemo } from "./demos/story-ring";
import { SubmitButtonDemo } from "./demos/submit-button";
import { SwitchDemo } from "./demos/switch";
import { TabsDemo } from "./demos/tabs";
import { TagChipDemo } from "./demos/tag-chip";
import { TextareaDemo } from "./demos/textarea";
import { ToastDemo } from "./demos/toast";
import { WeekHudDemo } from "./demos/week-hud";
import { StarInputDemo } from "./demos/star-input";
import { StepperDemo } from "./demos/stepper";
import { PageViewerDemo } from "./demos/page-viewer";
import { BadgeMedallionDemo } from "./demos/badge-medallion";
import { LedgerRowDemo } from "./demos/ledger-row";
import { PodiumDemo } from "./demos/podium";
import { SettingsGroupDemo } from "./demos/settings-group";
import { AdminRailDemo } from "./demos/admin-rail";
import { SplitViewDemo } from "./demos/split-view";
import { KvCardDemo } from "./demos/kv-card";
import { EditorRailDemo } from "./demos/editor-rail";
import { FloatingToolbarDemo } from "./demos/floating-toolbar";
import { CanvasStageDemo } from "./demos/canvas-stage";
import { LayerListDemo } from "./demos/layer-list";
import { BlockLibraryDemo } from "./demos/block-library";
import { BlockCanvasDemo } from "./demos/block-canvas";
import type { DemoGround } from "./ground";

// «ساحة اللعب» in the gallery — contract 4, DEC-183 §4.2(f), DEC-186 §2.
//
// ★ In M17 this was the only place the playground was seen. Since wave 17
// (DEC-199) it is the product's only visual language and every screen is inside
// it; the gallery is where a primitive is reviewed in isolation, on both grounds,
// and `/ar/ui` is in the visual baseline (`scripts/visual-diff.mjs`).
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
// ★ A DEMO THAT NAMES AN ID OR A RADIO GROUP TAKES THE GROUND (`./ground.ts`).
// A demo stands on the page twice, and two radio groups with one `name` are one
// group to the browser: the dark ground's would lose its checked option to the
// light ground's. `radio-group`, `code-input` and `date-time` suffix what they
// name.
// Every primitive of the wave stands here: 37 migrated and ten new.

// ★ EVERY ENTRY IS A FUNCTION, NEVER AN ELEMENT (`scoring`'s finding, wave 15).
// An element built once here and placed on both grounds is ONE subtree to the
// server renderer: it is written once and referenced twice, ids included, so a
// server component that calls `useId` writes the same id on both grounds.
// `level-card` did, 29 times. A function is called inside each ground and
// returns a new element, so each ground is its own render.
const DEMOS: { file: string; title: string; node: (ground: DemoGround) => ReactNode }[] = [
  // ── wave 17 (DEC-199): the eight the design's task list never named, and the button ──
  { file: "page-header", title: "عنوان الصفحة", node: () => <PageHeaderDemo /> },
  { file: "section-header", title: "عنوان القسم", node: () => <SectionHeaderDemo /> },
  { file: "prose", title: "النص المتصل", node: () => <ProseDemo /> },
  { file: "link", title: "الرابط", node: () => <LinkDemo /> },
  { file: "button", title: "الزرّ", node: () => <ButtonDemo /> },
  { file: "icon-button", title: "زرّ الأيقونة", node: () => <IconButtonDemo /> },
  { file: "submit-button", title: "زرّ الإرسال", node: () => <SubmitButtonDemo /> },
  { file: "icons", title: "الأيقونات", node: () => <IconsDemo /> },
  { file: "route-progress", title: "شريط التنقّل", node: (ground) => <RouteProgressDemo ground={ground} /> },
  { file: "dialog", title: "الحوار", node: () => <DialogDemo /> },
  { file: "toast", title: "الإشعار العابر", node: () => <ToastDemo /> },
  { file: "skeleton", title: "الهياكل", node: () => <SkeletonDemo /> },
  { file: "route-error", title: "خطأ المسار", node: () => <RouteErrorDemo /> },
  { file: "reorderable-list", title: "قائمة تُرتَّب بالنقر", node: () => <ReorderableListDemo /> },
  { file: "tag-chip", title: "الوسم", node: () => <TagChipDemo /> },
  { file: "badge", title: "شارة الحالة", node: () => <BadgeDemo /> },
  { file: "avatar", title: "الصورة الرمزية وحلقة الفريق", node: () => <AvatarDemo /> },
  { file: "card", title: "البطاقة", node: () => <CardDemo /> },
  { file: "progress", title: "التقدّم", node: () => <ProgressDemo /> },
  { file: "progress-bar", title: "شريط التقدّم", node: () => <ProgressBarDemo /> },
  { file: "empty-state", title: "الحالة الفارغة", node: () => <EmptyStateDemo /> },
  { file: "stat", title: "الرقم", node: () => <StatDemo /> },
  { file: "panel", title: "اللوحة", node: () => <PanelDemo /> },
  { file: "file-drop", title: "رفع الملفات", node: () => <FileDropDemo /> },
  { file: "sticker", title: "اللاصقة", node: () => <StickerDemo /> },
  { file: "poster", title: "الملصق", node: () => <PosterDemo /> },
  { file: "reaction-bar", title: "التفاعلات", node: () => <ReactionBarDemo /> },
  { file: "story-ring", title: "حلقة القصة", node: () => <StoryRingDemo /> },
  { file: "field", title: "الحقل", node: () => <FieldDemo /> },
  { file: "input", title: "حقل النص", node: () => <InputDemo /> },
  { file: "textarea", title: "النص الطويل", node: () => <TextareaDemo /> },
  { file: "select", title: "القائمة", node: () => <SelectDemo /> },
  { file: "checkbox", title: "خانة الاختيار", node: () => <CheckboxDemo /> },
  { file: "radio-group", title: "مجموعة الاختيار", node: (ground) => <RadioGroupDemo ground={ground} /> },
  { file: "switch", title: "المفتاح", node: () => <SwitchDemo /> },
  { file: "form-summary", title: "ملخّص الأخطاء", node: () => <FormSummaryDemo /> },
  { file: "code-input", title: "رمز الحضور", node: (ground) => <CodeInputDemo ground={ground} /> },
  { file: "session-cta", title: "زرّ الجلسة", node: () => <SessionCtaDemo /> },
  // ── wave 18 (DEC-207): the four the screens needed ──
  { file: "action-bar", title: "شريط الإجراء السفلي", node: () => <ActionBarDemo /> },
  { file: "week-hud", title: "أسبوعك", node: () => <WeekHudDemo /> },
  { file: "feed-item", title: "عناصر الخلاصة", node: () => <FeedItemDemo /> },
  { file: "attendee-stack", title: "من يحضر", node: () => <AttendeeStackDemo /> },
  // ── wave 19 (DEC-213, DEC-214): the four batch B needed ──
  { file: "star-input", title: "تقييم بالنجوم", node: (ground) => <StarInputDemo ground={ground} /> },
  { file: "stepper", title: "مراحل العملية", node: () => <StepperDemo /> },
  { file: "page-viewer", title: "عارض الصفحات", node: () => <PageViewerDemo /> },
  { file: "badge-medallion", title: "وسام الشارة", node: () => <BadgeMedallionDemo /> },
  { file: "ledger-row", title: "سطر النقاط", node: () => <LedgerRowDemo /> },
  { file: "podium", title: "منصة التتويج", node: () => <PodiumDemo /> },
  { file: "settings-group", title: "مجموعة الإعدادات", node: () => <SettingsGroupDemo /> },
  // ── wave 21 (DEC-225, DEC-227): the console's three ──
  { file: "admin-rail", title: "قائمة الإدارة", node: () => <AdminRailDemo /> },
  { file: "split-view", title: "العرض المقسوم", node: () => <SplitViewDemo /> },
  { file: "kv-card", title: "بطاقة البيانات", node: () => <KvCardDemo /> },
  // ── wave 23 (DEC-235, DEC-237): the studio's shared chrome ──
  { file: "editor-rail", title: "شريط المحرّر", node: () => <EditorRailDemo /> },
  { file: "floating-toolbar", title: "شريط الأدوات العائم", node: () => <FloatingToolbarDemo /> },
  { file: "canvas-stage", title: "مسرح اللوحة", node: () => <CanvasStageDemo /> },
  { file: "layer-list", title: "قائمة الطبقات", node: () => <LayerListDemo /> },
  // ── wave 23 (DEC-238 §4): the email builder's two, `notify`'s ──
  { file: "block-library", title: "مكتبة الكتل", node: () => <BlockLibraryDemo /> },
  { file: "block-canvas", title: "لوحة الكتل", node: () => <BlockCanvasDemo /> },
  { file: "rank-row", title: "صفّ الترتيب", node: () => <RankRowDemo /> },
  { file: "race-bar", title: "سباق الشركات", node: () => <RaceBarDemo /> },
  { file: "level-card", title: "بطاقة المستوى", node: () => <LevelCardDemo /> },
  { file: "data-table", title: "الجدول", node: () => <DataTableDemo /> },
  { file: "combobox", title: "القائمة القابلة للبحث", node: () => <ComboboxDemo /> },
  { file: "menu", title: "القائمة المنسدلة", node: () => <MenuDemo /> },
  { file: "tabs", title: "الألسنة", node: () => <TabsDemo /> },
  { file: "sheet", title: "الورقة", node: () => <SheetDemo /> },
  { file: "date-time", title: "التاريخ والوقت", node: (ground) => <DateTimeDemo ground={ground} /> },
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

// ★ Wave 17: the dark ground is the page's ROOT scope — the product's own ground — and carries the
// page's one `h1`. The light ground follows it as a sibling, never inside it: scopes do not nest,
// and an element inside both would match `pg-dark:` and `pg-light:` at once.
function Ground({ light }: { light?: boolean }) {
  return (
    <PlayScope light={light} root={!light} className="flex flex-col gap-8 p-4 md:p-8">
      {light ? (
        <p className="font-display text-play-md font-extrabold text-fg-heading">الأرضية الفاتحة — مدعومة، وليست الافتراضية</p>
      ) : (
        <PageHeader title="نظام التصميم" eyebrow="ساحة اللعب" description="كل عنصر من عناصر الواجهة، بكل حالاته، على أرضية المنتج الداكنة ثم على الفاتحة." />
      )}
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
          {d.node(light ? "light" : "dark")}
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
