// The design system's interface — `16` §4.2, §16.0, REQ-UIX-001, DEC-085.
//
// ★★ THIS FILE EXPORTS TYPES ONLY, AND IT IS LEAD-ONLY AND APPEND-ONLY.
//
// Types only, because a runtime barrel would drag `toast`, `combobox`,
// `route-progress`, `menu`, `tabs`, `sheet`, `switch` and `file-drop` — every
// one of them `"use client"` — into the client graph of every server page that
// imports `Card`. Import an implementation BY PATH:
//
//     import type { CardProps } from "@/components/ui";        // the contract
//     import { Card } from "@/components/ui/card";             // the component
//
// Lead-only and append-only, because it is the one file every track imports, so
// a conflict in it stops all four at once.
//
// THE INTERFACE IS FROZEN BEFORE THE IMPLEMENTATIONS EXIST. On day one of M9
// this file carries the full signature of every primitive and each `.tsx`
// beside it renders plain semantic HTML. Consumers import and typecheck
// immediately; implementations land underneath them. This is exactly what
// `src/components/sessions/slots/` did in wave 1, and it is why wave 1
// parallelised at all (`16` §16.0).
//
// OWNERSHIP IS PER FILE, NOT PER DIRECTORY (DEC-085). A glob with four writers
// is the failure `TEAM.md` exists to prevent; thirty-four files with one owner
// each is not. The map is in `CLAUDE.md`'s wave-5 table and in each
// `.claude/agents/*.md`. A teammate who needs a primitive changed opens a
// request in their note — they do not edit it.
//
//   lead      index · button · icon-button · link · skeleton · route-progress
//             toast · page-header · section-header · prose
//             route-error · icons · dialog · submit-button
//             reorderable-list (wave 10, DEC-160)
//   sessions  field · input · textarea · select · checkbox · radio-group
//             switch · form-summary
//   console   data-table · combobox · menu · tabs · sheet · date-time
//   content   card · badge · tag-chip · avatar · progress · empty-state
//             stat · panel · file-drop
//
// ★ WAVE 15 — «ساحة اللعب» (DEC-183, DEC-186). Ten files join, each with one
// owner, and `scoring` holds primitives for the first time:
//
//   lead      scope · objects/**
//   content   sticker · poster · reaction-bar · progress-bar · story-ring
//   sessions  session-cta · code-input
//   scoring   rank-row · race-bar · level-card
//
// Every one of the ten renders each of its states FROM PROPS. None reads the
// DAL, a session or a message catalogue; none is placed on a screen in M17;
// none is orchestrated. Their signatures are at the end of this file.
//
// `16` §4.2 counts thirty-one components; the file lists add `link`,
// `route-error` and `data-table`, which §4.2's table omits and §16.2's lists
// name — so thirty-four files, and §16.2 is authoritative (DEC-102).

import type { ComponentProps, ReactNode } from "react";
import type { SeatState, SessionPhase } from "@/lib/session-status";

// Re-exported so a track gets the whole status vocabulary from one import.
// Type-only, so this stays a types-only barrel.
export type { SeatState, SessionPhase, ViewerRelation } from "@/lib/session-status";

// ── shared vocabulary ─────────────────────────────────────────────────────

/** Every primitive takes `className` last and merges it last. */
export interface Styleable {
  className?: string;
}

export type Size = "sm" | "md" | "lg";

/**
 * Tone is the STATUS vocabulary, and it is a platform constant (DEC-073).
 * `live` and `ended` sit beside `error` and `success` outside the brand kit:
 * an org restyles the card a badge sits on, never what «أُلغيت» means.
 */
export type Tone = "neutral" | "info" | "success" | "live" | "ended" | "error";

/**
 * ★ An icon-only control must carry its own accessible name (REQ-NFR-007).
 * The type makes it impossible to forget, which is the only reliable way.
 */
export interface Labelled {
  label: string;
}

// ── Surface (4) ───────────────────────────────────────────────────────────

/** `content` · `card.tsx` — one component, four densities (`16` §6.4). */
/** ★ wave 18 (REQ-UIX-057, `content`): `post` — the feed's session post, a column that is its own
 *  `@container` and ignores `href` (a post holds several links; one wrapping link would nest them).
 *  Add-only: the four existing densities render as they did. */
export type CardDensity = "grid" | "row" | "compact" | "wide" | "post";

export interface CardProps extends Styleable {
  density?: CardDensity;
  /** The whole card is one link; nested interactives stop propagation. */
  href?: string;
  children: ReactNode;
}

export interface CardMediaProps extends Styleable {
  src?: string | null;
  alt?: string;
  /**
   * The typographic placeholder is generated from this when `src` is absent —
   * never an empty grey box (`16` §6.4).
   */
  placeholderFrom: string;
  /** `297/210` and `210/297` are A4 landscape and portrait — a certificate template's card
   *  (wave 8, `designer`'s W8.h, added by the lead as custodian). */
  aspect?: "4/5" | "16/9" | "1/1" | "297/210" | "210/297";
  /**
   * Rendered IN PLACE OF the image or the generated placeholder — a template card's media is a
   * live runtime render, not a URL, because a template has no artifact. `overlay` and `dimmed`
   * apply to it exactly as they do to an image. `placeholderFrom` is still required: it names
   * the card for the fallback when `children` is absent.
   */
  children?: ReactNode;
  /** Rendered over the media, top-start in the reading direction. */
  overlay?: ReactNode;
  priority?: boolean;
  /** An ended or cancelled session: grayscale and reduced opacity on the IMAGE or placeholder
   *  only — never on `overlay`, whose status badge must keep its contrast (DEC-123 item 1). */
  dimmed?: boolean;
  /**
   * `"dark"` limits the generated placeholder to the navy tints, so a card that
   * is a first impression — the public session card behind a shared link — reads
   * like the dark posters `DEC-125` makes the default. Absent, the tint follows
   * the title's hash across all six, as before (wave 7, `sessions`' R7).
   */
  placeholderTone?: "dark";
}

export interface CardBodyProps extends Styleable {
  children: ReactNode;
}

export interface CardActionsProps extends Styleable {
  children: ReactNode;
}

/** `content` · `panel.tsx` — a bordered region that is not a card. */
export interface PanelProps extends Styleable {
  tone?: Tone;
  children: ReactNode;
}

/** `console` · `sheet.tsx` — the phone bottom sheet (Radix). */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Announced as the sheet's accessible name; never omitted. */
  title: string;
  description?: string;
  side?: "bottom" | "inline-start" | "inline-end";
  children: ReactNode;
}

/** lead · `section-header.tsx` — the heading of a section inside a page. */
export interface SectionHeaderProps extends Styleable {
  title: string;
  /** Rendered as the heading level; the page owns `h1`. */
  as?: "h2" | "h3";
  id?: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}

// ── Type (3) ──────────────────────────────────────────────────────────────

/**
 * lead · `page-header.tsx` — breadcrumb, eyebrow, title, description, actions.
 * ★ Every screen uses it; that is what makes 49 pages feel like one product
 * (`16` §6.1 note 5). It owns the page's single `<h1>`.
 */
export interface PageHeaderProps extends Styleable {
  title: string;
  eyebrow?: string;
  description?: string;
  breadcrumb?: { href: string; label: string }[];
  /** The breadcrumb `<nav>`'s accessible name — `ui.pageHeader.breadcrumb`. A page carries
   *  several nav landmarks (the header, the tab bar), so an unnamed one is ambiguous. */
  breadcrumbLabel?: string;
  actions?: ReactNode;
  /** Rendered under the title — chips, status, meta. */
  meta?: ReactNode;
  /** Rendered ABOVE the title — a status badge, so state is seen before it is read (`16` §3
   *  principle 3, the canvas's hero). Not a string, unlike `eyebrow`. */
  status?: ReactNode;
  /** wave 19 (DEC-214 §4), add-only: a count drawn after the title in the muted face — the directory's
   *  «الأعضاء 212». Already formatted by the caller (Western numerals). Part of the `h1`'s text, so it is read. */
  count?: string;
}

/** lead · `prose.tsx` — long-form text with the typography tokens applied. */
export interface ProseProps extends Styleable {
  children: ReactNode;
  /** `1.7` body line-height is the default; headings get `1.4` (`10` §1). */
  size?: "sm" | "md";
}

/** `content` · `stat.tsx` — one number and what it means. */
export interface StatProps extends Styleable {
  label: string;
  /** Pre-formatted by the caller: numerals follow the ORG setting (REQ-INT-006). */
  value: string;
  hint?: string;
  tone?: Tone;
  href?: string;
}

// ── Form (11) ─────────────────────────────────────────────────────────────

/**
 * `sessions` · `field.tsx` — ★ THE ONLY WRAPPER.
 *
 * It wires `htmlFor`, `aria-describedby`, `aria-invalid` and `aria-required`
 * itself, so no screen can get them wrong (`16` §8.2 item 1). Required is
 * marked with «مطلوب» on the label — never an asterisk, which collides with
 * the RTL run (REQ-UIX-011).
 */
export interface FieldProps extends Styleable {
  /** The control's id. Generated when omitted. */
  id?: string;
  /**
   * A node, not only a string (wave 11, `content`'s request): a label built from what a member
   * typed — a task's question — must be isolated in `<bdi>`, as `error` already can be. Every
   * caller passing a string is unaffected.
   */
  label: ReactNode;
  hint?: string;
  /**
   * Adjacent, red, icon-marked — and colour is never the only channel. A
   * node, so an error that quotes what was typed can isolate it in `<bdi>`.
   */
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}

export type InputProps = Omit<ComponentProps<"input">, "size"> & {
  invalid?: boolean;
  size?: Size;
  /** A glyph at the inline start INSIDE the field — the shell's search. The control owns the
   *  padding that clears it, so no caller pairs `ps-*` with the size's `px-*` (DEC-111, DEC-133). */
  startIcon?: ReactNode;
};

export type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export type SelectProps = ComponentProps<"select"> & { invalid?: boolean };

export type CheckboxProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode };

export interface RadioGroupOption {
  value: string;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends Styleable {
  name: string;
  options: RadioGroupOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  invalid?: boolean;
  /**
   * The group's accessible name — a fieldset legend, not a floating label. A node, so a question a
   * member typed can be isolated in `<bdi>` (wave 11).
   */
  legend: ReactNode;
  /**
   * The group's error, under its options — adjacent, red, icon-marked, and never the only channel:
   * it sets `aria-invalid` on the group and joins its description, exactly as `<Field>`'s does
   * (wave 11; SCR-015's question fieldset and `star-rating` hand-rolled this).
   */
  error?: ReactNode;
}

export interface SwitchProps extends Styleable {
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}

/**
 * `console` · `combobox.tsx` — ★ PROMOTE AND GENERALISE, not build.
 *
 * `src/components/admin/member-picker.tsx` already is a searchable combobox —
 * a filtered list, the listbox role, `useId` wiring, keyboard handling — built
 * for SCR-053. What is new is Arabic normalisation of the match (REQ-DSC-004),
 * multi-select, and a shape general enough for the proposal form's
 * co-presenter field, which is ask 2. Today that field renders every org member
 * as a checkbox list: a scroll trap at 40, unusable at 400.
 */
export interface ComboboxOption {
  value: string;
  label: string;
  /** Second line — a company, a job title, a count. */
  hint?: string;
  disabled?: boolean;
  /** wave 19 (DEC-214 §4), add-only: the person's company colour, `#rrggbb`. A chosen chip draws it as the
   *  ring of its dot, reaching the DOM as `--team` (wave 15, contract 3). `null` or absent draws no ring. */
  teamColor?: string | null;
}

export interface ComboboxProps extends Styleable {
  id?: string;
  name: string;
  options: ComboboxOption[];
  /** Multi-select renders the chosen set as removable chips. */
  multiple?: boolean;
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  /** Free creation on Enter — tags do this, members do not (`16` §9.4). */
  allowCreate?: boolean;
  max?: number;
  invalid?: boolean;
  /** Announced when the filtered list changes. All six ICU plural forms. */
  resultsLabel?: (count: number) => string;
}

/**
 * `console` · `date-time.tsx` — adopts the existing RTL picker built for
 * SCR-043 under DEC-045 rather than replacing it. Its bidi and numeral
 * handling is already correct and was not free.
 */
export interface DateTimeProps extends Styleable {
  id?: string;
  name: string;
  /** The field's own name for the trigger's accessible name — «آخر موعد للحجز: …» rather than a
   *  generic «التاريخ والوقت» on every picker of a form (wave 8, the lead's request to `console`). */
  label?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (value: string | null) => void;
  min?: string;
  max?: string;
  /** Date only, or date and time. */
  granularity?: "date" | "minute";
  invalid?: boolean;
  timeZone?: string;
}

/**
 * `content` · `file-drop.tsx` — the CONTROL. It states the rules the server
 * enforces and never enforces them: uploads are sniffed on content, not
 * extension, after the bytes land, and there is no SVG anywhere (invariant 11).
 */
export interface FileDropProps extends Styleable {
  name: string;
  accept: string[];
  maxBytes: number;
  multiple?: boolean;
  /** Stated up front — «الحد الأدنى 1200×1500 بكسل» and so on; nodes, so a format name or size can sit in `<bdi>`. */
  requirements?: ReactNode[];
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * `sessions` · `form-summary.tsx` — ★ the literal answer to ask 5.
 *
 * Above the form on failure, focused programmatically, `role="alert"`, listing
 * every failed field as A LINK TO THAT FIELD'S CONTROL. «الفئة: اختر تصنيفًا»
 * jumps to and focuses the select.
 *
 * ★★ An anchor jump under a sticky header lands the focused control BEHIND it —
 * the accessibility feature defeating itself. `REQ-UIX-017`'s scroll-padding
 * tokens are what stop that, and there is a test rather than an assumption.
 */
export interface FormSummaryError {
  /** The control's id, used as the link target and the focus target. */
  fieldId: string;
  /** The field's label, so the summary reads «الفئة: اختر تصنيفًا». */
  label: string;
  message: string;
}

export interface FormSummaryProps extends Styleable {
  errors: FormSummaryError[];
  /** «تعذّر إرسال النموذج» — the heading above the list. */
  title: string;
  /** One reassuring line under the title — «ما كتبته محفوظ كما هو». Optional (wave 7, `sessions`' R1). */
  description?: string;
}

// ── Action (4) ────────────────────────────────────────────────────────────

/** `signal` and `quiet` joined in wave 15 (DEC-186 §6): the check-in's coral, and a filled tertiary. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "signal" | "quiet";

/**
 * lead · `button.tsx` — extends the existing house button with `ghost`,
 * `danger`, three sizes and `pending` built in.
 *
 * ★ Pending keeps the LABEL and adds a spinner beside it; it never blanks the
 * control (REQ-UIX-007). Inside a form the state comes from `useFormStatus`,
 * so a caller does not have to thread it.
 */
export interface ButtonProps extends Omit<ComponentProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: Size;
  /** Overrides `useFormStatus` when the action is not this form's. */
  pending?: boolean;
  /** Announced while pending — «جارٍ الحفظ…». */
  pendingLabel?: string;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /**
   * Wave 15, opt-in — a second child after the label, kept while pending: a call to action's
   * capacity chip. Inside the playground's scope the label stands at the start and this at the
   * end. It is part of the accessible name, so it is text, never decoration.
   */
  trailing?: ReactNode;
  children: ReactNode;
}

/**
 * lead · `submit-button.tsx` — `<Button>` wired to `useFormStatus()`.
 *
 * ★ A separate module from `ui/button` on purpose: `useFormStatus` needs a
 * client component, and `ui/button` must stay server-safe because the frozen
 * marketing page imports `ButtonLink` from it until M13. It is also the honest
 * boundary — the hook reports the nearest enclosing form's status, so it only
 * means anything on a control that submits that form.
 */
export type SubmitButtonProps = ButtonProps;

/** lead · `icon-button.tsx` — icon-only, so the name is mandatory. */
export interface IconButtonProps extends Omit<ComponentProps<"button">, "children">, Labelled {
  variant?: ButtonVariant;
  size?: Size;
  pending?: boolean;
  children: ReactNode;
}

/**
 * lead · `link.tsx` — the house `Link`, wrapping `next/link`.
 *
 * ★ Inside it a tiny client child calls `useLinkStatus()` and does two things:
 * renders an inline pending affordance on THAT link, and writes `pending` into
 * a small shared store that `<RouteProgress>` subscribes to. The obvious
 * design — one `<RouteProgress>` driven by `useLinkStatus()` — cannot work:
 * the hook must be used within a descendant of a `<Link>`, so it cannot drive
 * a bar that lives outside every link (`16` §7.1.1).
 */
export interface UiLinkProps extends Omit<ComponentProps<"a">, "href"> {
  href: string;
  /** Suppress the inline pending affordance where it would be noise. */
  quiet?: boolean;
  children: ReactNode;
}

/**
 * lead · `reorderable-list.tsx` — order by taps alone (`16` §10.2.1,
 * `REQ-DSG-028`, `SC 2.5.7`, `DEC-160` §5).
 *
 * «Three lists, one primitive»: a survey's questions, a choice question's
 * options and an email's blocks all reorder through this. ▲▼ on every row,
 * named «move up» / «move down» and DESCRIBED BY THE ROW THEY MOVE — a list of
 * twelve identical «up» buttons with no object is not a list anyone can use by
 * ear. A press-and-release is the whole gesture; there is no drag in it, and a
 * drag layered on later is an enhancement nobody needs in order to conform.
 *
 * ★ CONTROLLED. It never reorders itself: it hands back the whole new order
 * and the caller decides — an editor's state, a Server Action, an autosave.
 *
 * ★ A CLIENT COMPONENT WHOSE PROPS ARE FUNCTIONS, so it is composed inside a
 * client component. A Server Component cannot hand it `renderItem`
 * («Event handlers cannot be passed to Client Component props» — a crash only a
 * production build produces, `DEC-159`).
 */
export interface ReorderableListProps<Item> extends Styleable {
  items: readonly Item[];
  /** Stable across reorders — React keeps the row's DOM, and with it the focus. */
  getKey: (item: Item) => string;
  /**
   * The row's accessible name: what ▲▼ are described by, and what is announced
   * after a move. A question's text, a block's type and first words.
   */
  getName: (item: Item) => string;
  renderItem: (item: Item, context: ReorderableRowContext) => ReactNode;
  /** Controls beside ▲▼ at the row's end — remove, duplicate. */
  renderActions?: (item: Item, context: ReorderableRowContext) => ReactNode;
  /** The whole new order, by key, and what moved. */
  onReorder: (nextKeys: string[], moved: ReorderableMove) => void;
  /** The list's own accessible name — «أسئلة الاستبانة». */
  label: string;
  /** Every ▲▼ inert — a save in flight, a viewer who may not edit. */
  disabled?: boolean;
  /** `sm` (36 px) for a dense pane beside a canvas; `md` (44 px) is the house target. */
  size?: Extract<Size, "sm" | "md">;
  /**
   * Where ▲▼ and `renderActions` sit. `side` (the default): a column at the
   * row's end, right for a one-line item. `inline`: the row renders the item
   * alone and hands the controls to `renderItem` through `context.controls`,
   * for a CARD-shaped item — at 390 px a side column takes ~120 px from a card
   * and its inputs truncate (wave 10, SCR-065's editor). `09` SCR-065 puts the
   * arrows «at the start edge of its header»; the consumer places them there.
   */
  controls?: "side" | "inline";
}

export interface ReorderableRowContext {
  index: number;
  total: number;
  /** With `controls: "inline"`: ▲▼ and the actions, for the consumer to place. Otherwise null. */
  controls: ReactNode;
}

export interface ReorderableMove {
  key: string;
  from: number;
  to: number;
}

/** `console` · `menu.tsx` — Radix dropdown. Radix owns the accessibility. */
export interface MenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  icon?: ReactNode;
  tone?: Tone;
  disabled?: boolean;
  /** A ruled group above this item — the staff section of the account menu. */
  startsGroup?: boolean;
  /** The page this item leads to is the one on show — `aria-current="page"` and the marker (`console`, wave 8). */
  current?: boolean;
}

export interface MenuProps {
  /** The control that opens it; it keeps its own accessible name. */
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
}

/** `console` · `tabs.tsx` — Radix, RTL-aware through the existing provider. */
export interface TabItem {
  value: string;
  label: string;
  count?: number;
  href?: string;
}

export interface TabsProps extends Styleable {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** The strip's accessible name. */
  label: string;
  children?: ReactNode;
}

// ── Status (6) ────────────────────────────────────────────────────────────

/**
 * `content` · `badge.tsx` — ★ asks 4 and 6, in one component.
 *
 * `<SessionStatusBadge phase seat />` composes the two presentational axes into
 * one label, which is why «قائمة انتظار» and «يُغلق التسجيل قريبًا» are
 * derivations and not states (`16` §5.2). It appears in EIGHT places: the
 * browse card, the event page hero, `/app/me` upcoming and past, the calendar,
 * the admin session list, the host view, the notification rows and the public
 * card.
 *
 * `live` pulses a dot — static under `prefers-reduced-motion`.
 */
export interface BadgeProps extends Styleable {
  tone?: Tone;
  /** Outline rather than filled — `draft` and `pending_schedule`. */
  outline?: boolean;
  size?: "sm" | "md";
  icon?: ReactNode;
  children: ReactNode;
}

export interface SessionStatusBadgeProps extends Styleable {
  phase: SessionPhase;
  /** Absent for phases where capacity is not part of the label. */
  seat?: SeatState;
  /** Drives «يُغلق التسجيل قريبًا»; computed by `closingSoon()`. */
  closingSoon?: boolean;
  size?: "sm" | "md";
}

/** `content` · `tag-chip.tsx` — a tag, optionally removable, optionally a link. */
export interface TagChipProps extends Styleable {
  label: string;
  href?: string;
  count?: number;
  onRemove?: () => void;
  /** The accessible name of the remove control — «أزل الوسم: تقارير». */
  removeLabel?: string;
  /** A pressed filter toggle (`aria-pressed` or `aria-current`, the timeline's row A). */
  selected?: boolean;
  /** Removal as a LINK, so it works before hydration — the timeline's removable filter chips. */
  removeHref?: string;
}

/**
 * `content` · `avatar.tsx` — ★ initials are the DEFAULT and the permanent
 * fallback; there is no silhouette placeholder anywhere (REQ-PRF-009).
 *
 * The tint is chosen by a stable hash of the MEMBER ID, not of the name, which
 * would change when someone corrects their spelling. The glyph is wrapped in
 * `<bdi>`. The tint never encodes role, company or status. Nothing scales on
 * hover.
 */
export interface AvatarProps extends Styleable {
  memberId: string;
  displayName: string | null;
  /** A platform-stored path. Null, or a takedown, falls back to initials. */
  src?: string | null;
  size?: 24 | 32 | 34 | 40 | 56 | 96 | 160;
  /** Decorative beside a name that is already rendered. */
  decorative?: boolean;
  /**
   * The company's team colour — REQ-UIX-043, DEC-186 §5. ★ THREE values, not two:
   * `undefined` draws NO ring, which is every caller before wave 15; `null` draws the neutral
   * ring of a company that has no colour; `"#rrggbb"` draws the team ring.
   *
   * It rings the avatar and NEVER fills it: the fill stays the member's tint (REQ-PRF-009). The
   * component re-checks the value before it writes `--team`, because a custom property is
   * serialised as written.
   */
  teamColor?: string | null;
}

export interface AvatarStackProps extends Styleable {
  members: { memberId: string; displayName: string | null; src?: string | null }[];
  size?: 24 | 32;
  max?: number;
  /** All six ICU plural forms — «و3 آخرين». */
  overflowLabel?: (count: number) => string;
}

/** `content` · `progress.tsx` — determinate seats, or indeterminate work. */
export interface ProgressProps extends Styleable {
  /** Omit for indeterminate. */
  value?: number;
  max?: number;
  /** The bar's accessible name — «المقاعد المحجوزة». */
  label: string;
  /** Pre-formatted by the caller, in the org's numerals. */
  valueText?: string;
  tone?: Tone;
}

/**
 * `content` · `empty-state.tsx` — ★ principle 5, «never a dead end».
 *
 * `action` is REQUIRED, not optional: every empty state names what to do next
 * and links to it (REQ-UIX-012). A filtered-empty state names the filter that
 * emptied it and offers to drop just that one.
 */
export interface EmptyStateProps extends Styleable {
  title: string;
  description?: string;
  action: { label: string; href?: string; onClick?: () => void };
  /** «امسح عامل التصفية: فني» — offered alongside, not instead. */
  clearFilter?: { label: string; href: string };
  icon?: ReactNode;
  size?: "sm" | "md";
}

/**
 * lead · `toast.tsx` — bottom-centre on phone, bottom-start on desktop.
 * `role="status"` for success and `role="alert"` for failure; auto-dismiss at
 * 5 s EXCEPT errors, which stay (`16` §7.3).
 */
export interface ToastOptions {
  title: string;
  description?: string;
  tone?: Extract<Tone, "success" | "error" | "info">;
  /** A single undo or retry. Never more than one. */
  action?: { label: string; onClick: () => void };
}

export interface ToastHandle {
  show: (options: ToastOptions) => void;
}

// ── Loading (3) ───────────────────────────────────────────────────────────

/**
 * lead · `skeleton.tsx` — ★ a skeleton MUST NOT call `getTranslations`: it
 * renders before `setRequestLocale`. No text, `aria-hidden`,
 * direction-agnostic (`16` §7.1).
 */
export type SkeletonVariant = "text" | "title" | "card" | "media" | "row";

export interface SkeletonProps extends Styleable {
  variant?: SkeletonVariant;
  /** Repeat count — six card skeletons for browse. */
  count?: number;
  width?: string;
}

/**
 * lead · `route-progress.tsx` — the bar in the shell. It subscribes to the
 * store `ui/link` writes and shows only when a navigation has been pending for
 * more than the threshold; below that a bar is a flash of noise, and with
 * `loading.tsx` present most navigations are below it (`16` §7.1.1).
 */
export interface RouteProgressProps {
  /** Milliseconds before the bar appears. 150 by default. */
  delayMs?: number;
}

// ── Beyond §4.2's thirty-one ──────────────────────────────────────────────

/**
 * `console` · `data-table.tsx` — ★ the phone treatment is the REQUIREMENT.
 *
 * Below `md` this renders a STACKED CARD LIST, not a horizontally scrolling
 * table: a scrolling table in RTL on a phone is the single worst pattern in the
 * current console (`16` §6.7).
 */
export interface DataTableColumn<Row> {
  key: string;
  header: string;
  /** Pre-formatted; numerals follow the org setting. */
  cell: (row: Row) => ReactNode;
  sortable?: boolean;
  /** Shown in the phone card; omitted columns are dropped there. */
  onCard?: boolean;
  align?: "start" | "end";
}

export interface DataTableProps<Row> extends Styleable {
  /** The table's accessible name. */
  label: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  sort?: { key: string; direction: "asc" | "desc" };
  onSortChange?: (sort: { key: string; direction: "asc" | "desc" }) => void;
  selection?: {
    selected: string[];
    onChange: (selected: string[]) => void;
    /** All six ICU plural forms — «3 عناصر محددة». */
    label: (count: number) => string;
    actions: ReactNode;
  };
  empty: EmptyStateProps;
  /** Rendered instead of rows while the data is in flight. */
  pending?: boolean;
}

/**
 * lead · `route-error.tsx` — the shared body of every `error.tsx`.
 *
 * ★ `error.tsx` is a CLIENT component by Next's contract, so it is the one
 * place in the app shell that cannot read the DAL. Everything this needs comes
 * from props or the route (`16` §7.4).
 *
 * What happened in one sentence, a retry wired to `reset()`, and a way back.
 * Never a stack trace, and never an error code as the headline.
 */
export interface RouteErrorProps {
  /** One sentence. Not the exception's message. */
  title: string;
  description: string;
  /**
   * The retry, rendered only when BOTH `retryLabel` and `reset` are given. A
   * not-found page for something that is gone has nothing to retry, and an
   * invented retry is a control that does nothing (wave 7, `sessions`' R5).
   */
  retryLabel?: string;
  backLabel: string;
  backHref: string;
  reset?: () => void;
  /** Rendered small, for a support conversation. Never the headline. */
  digest?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Wave 15 — the playground's ten (DEC-183, DEC-186 §5 – §7; contract 2).
//
// Taken from the four plans approved at sync 1. Strings arrive as props, in
// Arabic first, with Western digits already formatted by the caller. A colour
// from data arrives as `teamColor` and reaches the DOM as `--team`.
// ═══════════════════════════════════════════════════════════════════════════

/** "#rrggbb", or null for a company that has no colour. Re-checked by the primitive. */
export type TeamColor = string | null;

// ── content (5) ───────────────────────────────────────────────────────────

export type StickerFill = "accent" | "signal" | "cyan" | "gold" | "violet" | "bone";

/**
 * `content` · `sticker.tsx` — REQ-UIX-031. Die-cut decoration, and NEVER a
 * status: a session's lifecycle is a badge (REQ-UIX-003). Static this wave; the
 * overshoot is the moments' wave's (DEC-186 §4).
 */
export interface StickerProps extends Styleable {
  /** The word — «محجوز», «مستوى جديد». */
  children: ReactNode;
  fill?: StickerFill;
  /** Degrees, clamped to [-6, 6]. */
  rotate?: number;
  size?: "sm" | "md";
  /** True only when it says what no badge on the surface says; otherwise `aria-hidden`. */
  informative?: boolean;
}

/**
 * `content` · `poster.tsx` — REQ-UIX-032. The rendered poster WHOLE when there
 * is one (REQ-UIX-026), its team-coloured placeholder until there is. It
 * composes `CardMedia`, so the whole-poster rule has one implementation.
 * `SessionPoster` stays the DAL slot. No drawn QR: a code that scans to nothing
 * looks like one that works.
 */
export interface PosterProps extends Styleable {
  /** The rendered master. Absent → the placeholder. */
  src?: string | null;
  /** The artifact's own size, so the box is reserved at its ratio. */
  width?: number;
  height?: number;
  /** Default "" — the host renders the title as text. */
  alt?: string;
  /** Placeholder: the title in the display face, balanced, never clipped on a line. */
  title: string;
  category?: string;
  /** Pre-formatted, Western digits — «2 أكتوبر، 6:30 م». */
  date?: string;
  teamColor: TeamColor;
  /** ★ Drawn on the placeholder: colour is never the only channel. */
  teamName: string;
  /** A `<Sticker>` at the placeholder's inline end. */
  sticker?: ReactNode;
  priority?: boolean;
}

export interface ReactionBarItem {
  /** Matches `reactions.kind`. The SET is the caller's; the primitive names none. */
  kind: string;
  /** The accessible name — «إعجاب». */
  label: string;
  count: number;
  pressed: boolean;
  /** From `ui/icons`. Pressed is never colour alone: pass the `filled` form when pressed. */
  icon: ReactNode;
}

/**
 * `content` · `reaction-bar.tsx` — REQ-UIX-034. A reaction earns nothing
 * (REQ-EVT-004), so nothing about it reads as an achievement. The
 * acknowledgement is the pressed state, shown in place.
 */
export interface ReactionBarProps extends Styleable {
  /** The group's name — «التفاعلات». */
  label: string;
  items: ReactionBarItem[];
  onToggle?: (kind: string) => void;
  /** A frozen thread shows counts and offers nothing. */
  readOnly?: boolean;
  pending?: boolean;
}

/**
 * `content` · `progress-bar.tsx` — REQ-UIX-036. One track, one fill, grown by
 * `scaleX` from the inline start. `progress.tsx` keeps its `width` fill and its
 * indeterminate mode until its three consumers adopt this one (DEC-186 §5).
 */
export interface ProgressBarProps extends Styleable {
  value: number;
  /** Default 100. */
  max?: number;
  /** The accessible name — «مستواك». Ignored when `decorative`. */
  label?: string;
  /** Pre-formatted, Western digits — «320 من 500». */
  valueText?: string;
  fill?: "accent" | "signal" | "team" | "text";
  /** With `fill="team"`. */
  teamColor?: TeamColor;
  /** 3 px — a story's segment; 10 px — a level, a race. */
  size?: "sm" | "md";
  /**
   * `aria-hidden`, no role: the value is already in text beside the bar, and a second
   * `progressbar` would read it twice (the race bar's case — `scoring`'s request).
   */
  decorative?: boolean;
}

export type StoryRingState = "live" | "upcoming" | "recap" | "seen";

/**
 * `content` · `story-ring.tsx` — REQ-UIX-040. A button that will open a
 * session's story; nothing of the viewer. Four states told apart WITHOUT
 * colour, each by its word and its shape. Static: no pulse (DEC-186 §4).
 */
export interface StoryRingProps extends Styleable {
  state: StoryRingState;
  /** The accessible name, naming the session. */
  label: string;
  /** The state's word, visible — «مباشر», «ملخص», «قادمة», «شوهدت». */
  stateLabel: string;
  /** One letter — the avatar's rule. */
  glyph: string;
  /** The line under the ring — «اليوم». */
  caption: string;
  teamColor?: TeamColor;
  onOpen?: () => void;
}

// ── sessions (2) ──────────────────────────────────────────────────────────

/** What pressing does. Exactly one of the two. */
export type SessionCtaAct =
  | { href: string; action?: never }
  /** A Server Action the CALLER bound (DEC-159) — never an inline closure from a Server Component. */
  | { action: (formData: FormData) => void | Promise<void>; href?: never };

/**
 * The six states of REQ-UIX-033. Which one a viewer gets is the affordance
 * matrix's answer (REQ-UIX-015), computed by the caller; this type only
 * carries it. «On the waitlist» is `booked` with `hold: "waitlist"`.
 */
export type SessionCtaState =
  | { kind: "reserve"; act: SessionCtaAct }
  | { kind: "waitlist"; act: SessionCtaAct }
  | {
      kind: "booked";
      hold?: "seat" | "waitlist";
      /** ★ wave 18 (REQ-UIX-057): optional. Absent, the booked face is drawn alone — the feed, where a
       *  post's control is a link and nothing is cancelled there (DEC-206 §4.57). */
      cancel?: { label: string; act: SessionCtaAct; note?: string };
      /** wave 16 (R4, DEC-197): drawn BETWEEN the face and the cancel — the calendar, so it keeps `16` §5.4.2's
       *  place in the tab order. Additive; absent, nothing is drawn. */
      between?: ReactNode;
    }
  | { kind: "checkIn"; act: SessionCtaAct }
  /** ★ wave 18 (REQ-UIX-057): «قيّم الجلسة» — drawn as `reserve` is, under its own name, so the matrix is
   *  never told a lie. `EventDone.dc.html`, and the feed's recap. */
  | { kind: "rate"; act: SessionCtaAct }
  /** `note` is the sentence beneath the face — «تصل النقاط عند انتهاء الجلسة» (REQ-CHK-018). Never in the chip. */
  | { kind: "attended"; note?: string }
  | { kind: "none"; reason: string };

/**
 * `sessions` · `session-cta.tsx` — REQ-UIX-033. ★ It decides nothing and holds
 * no state: it never moves from `reserve` to `booked` on a press. The caller
 * re-renders it after the server answers, so a seat is never shown as
 * confirmed early (REQ-UIX-007). It composes the lead's `Button`.
 */
export interface SessionCtaProps extends Styleable {
  state: SessionCtaState;
  /** The words on the face. */
  label: string;
  /**
   * The trailing chip — «12 من 40», «+50». ★ A FEW CHARACTERS, NEVER A SENTENCE: a chip does not
   * wrap, and one that tried swallowed the control at 326 px. A sentence is a state's `note`.
   * Drawn inside `<bdi>`, and part of the accessible name.
   */
  chip?: string;
  /** Beside the spinner while an action is in flight. The label never changes. */
  pendingLabel?: string;
  /** Overrides `useFormStatus`. */
  pending?: boolean;
  /** ★ wave 18, add-only: `md` is the compact 44 px face `HomeDesktop.dc.html` draws beside the reaction
   *  pills. Default `lg`. */
  size?: "lg" | "md";
  /** ★ wave 18, add-only: `auto` sizes to the label. Default `full`. */
  width?: "full" | "auto";
}

/**
 * `sessions` · `code-input.tsx` — REQ-UIX-035. Six boxes in a `dir="ltr"` group
 * inside the Arabic page; the code is POSTED as one field (REQ-CHK-003). The
 * alphabet is the migration's — six of `ACDEFGHJKMNPQRTUVWXY34679`. It does not
 * filter as the member types, and a wrong code never animates.
 */
export interface CodeInputProps extends Styleable {
  /** The hidden field the assembled code posts under. */
  name: string;
  /** The first box's id; the others follow. Generated when omitted. */
  id?: string;
  /** The group's name, rendered as its visible label. It does not go inside a `<Field>`. */
  label: ReactNode;
  /** Each box's position — «الخانة 1 من 6». One string per box, from the caller's catalogue. */
  positionLabels: readonly string[];
  /** 6. `positionLabels` must be as long. */
  length?: number;
  /** The code a refused submission carried back. */
  defaultValue?: string;
  /** Beneath the boxes; tied to the GROUP by `aria-describedby`. */
  error?: ReactNode;
  /** Invalid with the message elsewhere; pass its id below. */
  invalid?: boolean;
  /** Merged with the error's id, never replacing it. */
  "aria-describedby"?: string;
  disabled?: boolean;
  /** Wave 18 (`SCR-014`, add-only): `center` centres the label and the boxes. Default `start` — where they have always stood. */
  align?: "start" | "center";
  /** Wave 18 (`SCR-014`, `DEC-212`, add-only): merged into the six boxes' group only — the refused code's one shake. Unset, nothing changes. */
  boxesClassName?: string;
}

// ── scoring (3) ───────────────────────────────────────────────────────────

/**
 * `scoring` · `rank-row.tsx` — REQ-UIX-037. One member's row on a board.
 *
 * ★ There is NO `src`: the row draws the avatar's initials in the team ring and
 * never a photograph (DEC-183 §3, DEC-099). The type makes one impossible to pass.
 * ★ A leaderboard never shames. There is no «fell» state: a row whose rank fell
 * renders byte-identically to a row with no `movement`. Only a rise is drawn.
 */
export interface RankRowProps extends Styleable {
  rank: number;
  /** What a screen reader hears — «المركز 5». */
  rankLabel: string;
  /** The avatar's tint key — never the name. */
  memberId: string;
  displayName: string;
  company: string | null;
  teamColor: TeamColor;
  /** The digits shown, formatted by the caller. */
  points: string;
  /** What a screen reader hears — «1,410 نقطة». */
  pointsLabel: string;
  /** Set on the viewer's own row only: outlined AND carrying this word — «أنت». */
  selfLabel?: string | null;
  /** The primitive compares: `previousRank > rank` draws the rise; anything else draws nothing. */
  movement?: { previousRank: number; riseLabel: string } | null;
  href?: string;
}

/** `scoring` · `race-bar.tsx` — REQ-UIX-038. The colour is never the only thing that names the company. */
export interface RaceBarProps extends Styleable {
  companyName: string;
  teamColor: TeamColor;
  /** The ranking metric's value, formatted and possibly signed by the caller. */
  value: string;
  /** Names the metric the org ranks by (REQ-LDR-005). Drawn visibly. */
  metricLabel: string;
  /** 0 to 1, relative to the leader. A negative, NaN or missing value draws an empty track. */
  fraction: number;
  rank?: number;
  /** Required when `rank` is given. */
  rankLabel?: string;
  /** The other metric, quieter — REQ-LDR-004 keeps both visible. */
  secondary?: { label: string; value: string } | null;
  /** Set on the viewer's own company only — «فريقك». */
  ownLabel?: string | null;
  /**
   * ★ wave 18 (DEC-207, `scoring` W3), add-only: `inline` is the one-line row the home's race draws — ring,
   * name, bar, figure. The metric is still said on every row to a screen reader (REQ-LDR-005). Default
   * `stacked`, which every call site before wave 18 renders.
   */
  layout?: "stacked" | "inline";
}

/** One face of the level card. */
export interface LevelFace {
  /** `levels.sort_order`. It picks the ramp stop; the name never does. Clamped to 1–5. */
  tier: number;
  name: string;
  /** Heads the face — «مستواك الحالي», «مستوى جديد». */
  caption: string;
  /** The privileges the org has ENABLED at this level, by name. May be empty. */
  unlocks: readonly string[];
}

/**
 * `scoring` · `level-card.tsx` — REQ-UIX-039. Both faces are in the document in
 * every state, and neither is hidden from assistive technology. A face never
 * names a privilege the member does not have (DEC-186 §7).
 */
export interface LevelCardProps extends Styleable {
  level: LevelFace;
  reached?: LevelFace | null;
  /** Which face shows. Default «level». */
  shown?: "level" | "reached";
  /** Heads the unlock list — «يفتح لك». */
  unlocksLabel: string;
  /** Said on a face whose `unlocks` is empty. */
  noUnlocksLabel: string;
  /**
   * wave 16 (DEC-197): the two faces stacked in 3D, back-to-back, for moment 4's turn. Default `false`: the
   * layout every screen has today, both faces readable without the flip.
   */
  flip?: boolean;
}

// ── wave 18 (DEC-205, DEC-206, DEC-207, REQ-UIX-057) — four primitives for the screens ──────────────
// Types only, landed by the lead at sync 1 from the three plans (contract 2). The files arrive with their
// owners' commits, each with its registry entry, its scope test and its demo.

/**
 * `sessions` · `action-bar.tsx` — the bottom bar of an immersive screen: ONE primary and at most two
 * secondary controls, padded for the safe area. It decides nothing and holds no state; every control is
 * the caller's node. It is never transformed, filtered or clipped (DEC-188 §5).
 */
export interface ActionBarProps extends Styleable {
  /** The group's accessible name — «إجراءات الجلسة». Rendered as `role="group"`, never a landmark. */
  label: string;
  /** The one primary: a `SessionCta`, a `SubmitButton` or a `ButtonLink`. Takes the free width. */
  primary: ReactNode;
  /** After the primary, in reading order. A tuple, so a third is a type error. */
  secondary?: readonly [ReactNode] | readonly [ReactNode, ReactNode];
  /** One quiet line under the row — SCR-014's «لم تلتقط الرمز؟». */
  note?: ReactNode;
  /** `fixed` (default) pins it to the viewport's block end; `static` is for the gallery. */
  position?: "fixed" | "static";
  /** Hide from this breakpoint up — the event page shows its action row instead. */
  hideFrom?: "md" | "lg";
}

/** One figure of the week. `value` is a NODE so a screen can hand in a counting figure (moment 3); the
 *  primitive never formats a number. `valueLabel` is what a screen reader hears for the drawn figure. */
export interface WeekHudFigure {
  label: ReactNode;
  value: ReactNode;
  valueLabel: string;
  /** Makes the whole tile a link. */
  href?: string;
}

/**
 * `scoring` · `week-hud.tsx` — three figures and the way to the next level, from props.
 * ★ A MISSING RANK AND A DISABLED STREAK ARE ABSENCES, NEVER ZEROS: the type has no place for a zero rank.
 */
export interface WeekHudProps extends Styleable {
  /** The group's accessible name — «حصيلتك هذا الشهر». */
  label: string;
  /** Ranked: the figure, and a rise shown beside it (never moved by the primitive). Unranked: words. */
  rank: (WeekHudFigure & { movement?: { riseLabel: string } | null }) | { label: ReactNode; absent: string; href?: string };
  /** `null`: the org has no streak rule — the tile is not drawn. `absent`: on, none running — words. */
  streak: WeekHudFigure | { label: ReactNode; absent: string } | null;
  /** A balance of 0 is a true figure and is drawn. `delta` is the «+N» of moment 3's static state. */
  points: WeekHudFigure & { delta?: ReactNode | null; deltaLabel?: string | null };
  /** `null`: no level yet — no bar. */
  level: { value: number; max: number; line: ReactNode } | { line: ReactNode } | null;
}

interface FeedItemBase extends Styleable {
  /** Pre-formatted by the caller, Western digits — «قبل ساعتين», «أمس». */
  time: string;
}

/** An achievement: a colleague's badge or completed streak. ★ No reaction slot (DEC-206 §4.53). */
export interface FeedItemAchievementProps extends FeedItemBase {
  variant: "achievement";
  /** The glyph in the tile, from `ui/icons`. */
  icon: ReactNode;
  /** The sentence, composed by the caller: the member's name inside `<bdi>`. */
  children: ReactNode;
  /** The member's company, drawn before the time. Null draws the time alone. */
  context?: string | null;
}

/** An org's announcement (REQ-UIX-056). ★ No author, no action, no reaction. */
export interface FeedItemAnnouncementProps extends FeedItemBase {
  variant: "announcement";
  /** «إعلان من الإدارة» — the visible source line; the megaphone glyph is the primitive's. */
  sourceLabel: string;
  /** Plain text, drawn whole in `<bdi dir="auto">`, never clamped. */
  body: string;
}

/** A completed session's recap. */
export interface FeedItemRecapProps extends FeedItemBase {
  variant: "recap";
  title: string;
  href: string;
  /** «اكتملت» — a word, not a status badge. */
  doneLabel: string;
  /** Composed by the caller — who presented, how many attended, how many photos. */
  meta: ReactNode;
  /** At most three; more are ignored. Empty draws no strip. */
  photos: { src: string; alt: string; width?: number | null; height?: number | null }[];
  /** The row under the strip: the caller's `ReactionBar`. */
  reactions?: ReactNode;
  /** A LINK to the session's materials, never a download (DEC-206 §4.55). Absent → not drawn. */
  materials?: { href: string; label: string } | null;
}

/** `content` · `feed-item.tsx` — one `<article>`, three variants. */
export type FeedItemProps = FeedItemAchievementProps | FeedItemAnnouncementProps | FeedItemRecapProps;

/**
 * `content` · `attendee-stack.tsx` — overlapping avatars with team rings and a count in words.
 * ★ It draws who it is GIVEN; it never decides who may be seen (A33 rule 3, DEC-206 §4.56).
 */
export interface AttendeeStackProps extends Styleable {
  /** Only people a viewer RLS already answers for. May be empty: the count line stands alone. */
  people: { memberId: string; displayName: string | null; src?: string | null; teamColor?: string | null }[];
  /** How many faces at most. Default 4. */
  max?: number;
  /** The count IN WORDS, all six plural forms built by the caller. Always drawn. */
  countLabel: string;
  /** The group's accessible name — «من يحضر». */
  label: string;
  size?: 24 | 32;
}


// ── wave 19 (DEC-213, DEC-214, REQ-UIX-064) — four primitives for batch B ────────────────────────────
// Types only, landed by the lead at sync 1 from the four plans (contract 2). The files arrive with their
// owners' commits, each with its registry entry, its scope test and its demo; the floor moves to 57 with the
// fourth.

/** The five names of a star row, star 1 first — «نجمة واحدة» … «5 نجوم». The caller formats them (six ICU forms). */
export type StarLabels = readonly [string, string, string, string, string];

interface StarInputShared extends Styleable {
  /** The visible name of the row — «تقييم الجلسة». */
  legend: string;
  /** Each star's accessible name, and the line read back under the row. */
  starLabels: StarLabels;
  /** `lg` is the rate screen's 48 px star; `md` (default) a receipt's row. */
  size?: "md" | "lg";
}

/** The input: a radio group of five native radios. Star 1 is first in DOM, so it is the inline start — the right
 *  in RTL — and ← increases, natively. Fill and hover from the right, by CSS. */
export interface StarInputEditableProps extends StarInputShared {
  readOnly?: false;
  /** The field's name, and the group's `id` — the error summary's link target. */
  name: string;
  /** A saved rating, or what a failed round trip handed back. Uncontrolled: the radio is `defaultChecked`. */
  defaultValue?: 1 | 2 | 3 | 4 | 5;
  required?: boolean;
  /** «مطلوب», drawn beside the legend when `required`. */
  requiredLabel?: string;
  /** Adjacent, icon-marked, at `#<name>-error`, tied to the group by `aria-describedby`. */
  error?: ReactNode;
  disabled?: boolean;
}

/** The read-only face — the closed window and the receipt. One `role="img"`; no radio, no radiogroup. */
export interface StarInputReadOnlyProps extends StarInputShared {
  readOnly: true;
  value: 1 | 2 | 3 | 4 | 5;
  /** The image's whole accessible name — «تقييم الجلسة: 5 نجوم». The caller composes it. */
  label: string;
}

/** `event` · `star-input.tsx` — server-safe: no hook, no `"use client"`. */
export type StarInputProps = StarInputEditableProps | StarInputReadOnlyProps;

/** `sessions` · `stepper.tsx` — a process's steps, in order (DEC-213 §5.125). */
export type StepperStepStatus = "done" | "current" | "upcoming";

export interface StepperStep {
  /** Stable key. */
  id: string;
  /** The step's name, in the reader's language — «قيد المراجعة». */
  label: string;
  status: StepperStepStatus;
}

export interface StepperProps extends Styleable {
  /** The `<ol>`'s accessible name — «مراحل المقترح». */
  label: string;
  /** In order. At most one `current`; a second is rendered as `upcoming`. */
  steps: readonly StepperStep[];
  /** Read after a done step's label by assistive technology — «مكتملة». The check glyph is the visible mark. */
  doneLabel: string;
  /** The current step's fill: `signal` (coral, «needs you», default) or `accent`. A state colour, never a
   *  status colour (`DEC-073` untouched). */
  currentTone?: "signal" | "accent";
}

/** One rendered page of a material — never the source file (`REQ-MAT-007`). */
export interface PageViewerPage {
  /** As stored; shown under a thumbnail. */
  pageNumber: number;
  /** Signed, short-lived. */
  imageUrl: string;
  thumbnailUrl: string;
  /** The rendered page's real size: reserves its box. */
  width: number;
  height: number;
}

/**
 * The viewer's words. ★ The formatters are FUNCTIONS, so `PageViewerLabels` is built in a CLIENT component — the
 * screen's chrome — and never handed across the server–client boundary (`DEC-159`, `DEC-214` §3).
 */
export interface PageViewerLabels {
  previous: string;
  next: string;
  /** The scrubber's name — «الانتقال إلى صفحة». */
  scrubber: string;
  /** The rail's name — «الصفحات». */
  rail: string;
  thumbnail: (pageNumber: number) => string;
  /** The live region — «صفحة <bdi>7</bdi> من <bdi>24</bdi>». */
  pageOf: (position: number, total: number) => ReactNode;
  /** The same, plain — `aria-valuetext` and the image's alt. */
  pageOfText: (position: number, total: number) => string;
  /** Under the scrubber — «<bdi>7</bdi> من <bdi>24</bdi>». */
  position: (position: number, total: number) => ReactNode;
  zoomIn: string;
  zoomOut: string;
  /** The zoomed stage's name, when it is focusable. */
  stage: string;
  noPages: string;
}

/**
 * `content` · `page-viewer.tsx` — the page, previous and next, the scrubber, the rail, zoom and the keys
 * (DEC-213 §4). ★ «Next» advances in the reading direction and sits at the inline-end by DOM order; on desktop
 * in RTL ← is next. The one thing called page-viewer in `src/`.
 */
export interface PageViewerProps extends Styleable {
  pages: PageViewerPage[];
  /** The reading direction — the only input to the keys, the swipe and the zoom origin. */
  dir: "rtl" | "ltr";
  title: string;
  labels: PageViewerLabels;
  /** 1-based position in `pages`. Controlled with `onPageChange`, or uncontrolled. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** An index into the zoom steps. Controlled with `onZoomChange`, or uncontrolled. */
  zoom?: number;
  defaultZoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** Draw the zoom controls inside the viewer (default) or leave them to the screen's chrome. */
  showZoom?: boolean;
  /** The rail, from `lg` only, at the inline-start (DEC-213 §5.84). Default true. */
  showRail?: boolean;
  /** A tap on the page that was not a swipe — the screen toggles its chrome (DEC-213 §5.87). */
  onStageTap?: () => void;
  /** Any key the viewer sees — the screen brings hidden chrome back. */
  onKeyActivity?: () => void;
}

/** The zoom controls, for a screen that draws them in its own chrome. */
export interface PageViewerZoomProps extends Styleable {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  labels: Pick<PageViewerLabels, "zoomIn" | "zoomOut">;
}

/** The fills a badge medallion may take — the stickers' allowed set (`DEC-183` §2). Never a company's colour, never
 *  a status's (`DEC-073`). */
export type MedallionFill = "accent" | "signal" | "cyan" | "gold" | "violet" | "bone";

/**
 * `scoring` · `badge-medallion.tsx` — a disc with its 4 px drop and the name below it (DEC-213 §5.126). Reads no
 * data; static — no hover scale, no transition, no keyframe of its own. The drop is `color-mix()` of the fill with
 * the ground (DEC-214 §4), not a token per fill.
 */
export interface BadgeMedallionProps extends Styleable {
  /** The badge's name, drawn under the disc inside `<bdi>`. */
  name: string;
  /** A badge's own fill — or a level's ramp stop (clamped 1–5, as `level-card`'s). */
  fill: MedallionFill | { level: number };
  /** Decorative and `aria-hidden`: a glyph from `ui/icons`, chosen by the caller. Absent → a plain disc. */
  glyph?: ReactNode;
  /** `md` 64 px, `sm` 52 px. Default `md`. */
  size?: "md" | "sm";
  /** `false` beside a name already drawn: the name is not drawn and the block is `aria-hidden`. Default `true`. */
  showName?: boolean;
  /** Read after the name, never drawn (`sr-only`). */
  description?: string;
}
