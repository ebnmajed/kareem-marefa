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
//             splash · toast · page-header · section-header · prose
//             route-error · icons · dialog
//   sessions  field · input · textarea · select · checkbox · radio-group
//             switch · form-summary
//   console   data-table · combobox · menu · tabs · sheet · date-time
//   content   card · badge · tag-chip · avatar · progress · empty-state
//             stat · panel · file-drop
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
export type CardDensity = "grid" | "row" | "compact" | "wide";

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
  aspect?: "4/5" | "16/9" | "1/1";
  /** Rendered over the media, top-start in the reading direction. */
  overlay?: ReactNode;
  priority?: boolean;
  /** An ended or cancelled session: grayscale and reduced opacity on the IMAGE or placeholder
   *  only — never on `overlay`, whose status badge must keep its contrast (DEC-123 item 1). */
  dimmed?: boolean;
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
  label: string;
  hint?: string;
  /** Adjacent, red, icon-marked — and colour is never the only channel. */
  error?: string;
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
  /** The group's accessible name — a fieldset legend, not a floating label. */
  legend: string;
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
  /** Stated up front — «الحد الأدنى 1200×1500 بكسل» and so on. */
  requirements?: string[];
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
}

// ── Action (4) ────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

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

/**
 * lead · `splash.tsx` — the Preply touch, used ONCE: the first paint of the
 * app shell on a cold load.
 *
 * ★ A splash that covers content delays LCP by exactly as long as it is shown.
 * So it is CSS-only, painted in the same document as the shell, and it fades on
 * the shell's FIRST PAINT, not on hydration — a cross-fade over content that is
 * already there, never a gate in front of content that is not. If it costs LCP
 * against REQ-NFR-008, the splash is dropped, not the budget (`16` §7.2).
 */
export interface SplashProps {
  /** The wordmark's accessible name; the bar itself is decorative. */
  label: string;
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
  retryLabel: string;
  backLabel: string;
  backHref: string;
  reset: () => void;
  /** Rendered small, for a support conversation. Never the headline. */
  digest?: string;
}
