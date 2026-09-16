import type { ComponentProps } from "react";

// The permitted glyph set, as inline SVGs (DEC-019, 04 §11). Brand policy
// bans icon libraries; these eight are the whole vocabulary — dots, lines,
// chevron, arrow, check, spinner, close, plus. Anything else is a design
// decision, not an import.
//
// Every glyph is decorative by default (`aria-hidden`); a glyph that carries
// meaning on its own takes a `label`, which becomes an accessible name. Size
// follows the text (`1em`), colour follows `currentColor`.
//
// Direction: chevrons and arrows point "forward" or "back" in READING order
// and mirror in RTL (10 §2.4). Checkmarks, dots, lines, the spinner, close
// and plus never mirror. The `rtl:` variant adds no specificity (10 §2.3), so
// the mirror is the only transform these components apply.

type IconProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Accessible name. Omit for a purely decorative glyph. */
  label?: string;
};

function Svg({ label, className = "", ...props }: ComponentProps<"svg"> & { label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={`inline-block shrink-0 ${className}`}
      {...props}
    />
  );
}

/** A filled dot — status, bullets, the constellation's nodes. Never mirrors. */
export function DotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A hairline — separators, the chapter spine. Never mirrors. */
export function LineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
    </Svg>
  );
}

type Direction = "forward" | "back" | "down" | "up";

// In LTR "forward" points right. In RTL the reader moves left, so the same
// glyph mirrors. Up and down are the same in both.
const pointing: Record<Direction, { path: string; mirrors: boolean }> = {
  forward: { path: "m9 6 6 6-6 6", mirrors: true },
  back: { path: "m15 6-6 6 6 6", mirrors: true },
  down: { path: "m6 9 6 6 6-6", mirrors: false },
  up: { path: "m6 15 6-6 6 6", mirrors: false },
};

/** Disclosure and navigation. Mirrors in RTL when pointing forward/back. */
export function ChevronIcon({ direction = "forward", className = "", ...props }: IconProps & { direction?: Direction }) {
  const p = pointing[direction];
  return (
    <Svg data-direction={direction} className={`${p.mirrors ? "rtl:-scale-x-100" : ""} ${className}`} {...props}>
      <path d={p.path} />
    </Svg>
  );
}

const arrows: Record<Direction, { path: string; mirrors: boolean }> = {
  forward: { path: "M4 12h16m-6-6 6 6-6 6", mirrors: true },
  back: { path: "M20 12H4m6-6-6 6 6 6", mirrors: true },
  down: { path: "M12 4v16m-6-6 6 6 6-6", mirrors: false },
  up: { path: "M12 20V4m-6 6 6-6 6 6", mirrors: false },
};

/** Links that go somewhere. Mirrors in RTL when pointing forward/back. */
export function ArrowIcon({ direction = "forward", className = "", ...props }: IconProps & { direction?: Direction }) {
  const p = arrows[direction];
  return (
    <Svg data-direction={direction} className={`${p.mirrors ? "rtl:-scale-x-100" : ""} ${className}`} {...props}>
      <path d={p.path} />
    </Svg>
  );
}

/** Done, selected, present. Never mirrors (10 §2.4). */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  );
}

/**
 * Busy. Takes a `label` in the current language and exposes it as a live
 * status, because a spinner with no text is a spinner nobody can hear.
 */
export function SpinnerIcon({ label, className = "", ...props }: IconProps & { label: string }) {
  return (
    <Svg label={label} role="status" aria-live="polite" className={`motion-safe:animate-spin ${className}`} {...props}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Svg>
  );
}

/** Dismiss. Never mirrors. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

/** Add. Never mirrors. */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE HOUSE APP SET — `16` §4.2.1, DEC-079, and `04` §11 as amended.

   The eight glyphs above are the MARKETING vocabulary and do not change: the
   landing page is the frozen public contract until M13, and `npm run visual`
   is 0.000% on it. The rule below them splits by surface, on the owner's
   decision of 2026-09-15:

     marketing  the eight, unchanged — the constellation is the language there
     the app    this set, drawn for this product

   A landing page carries its meaning in one metaphor and any stock icon
   cheapens it. A console of 31 admin and platform screens is the opposite
   problem: a bottom tab bar with no icons is not a tab bar, a dense admin
   table with no row affordances is a wall of text, and every control forced to
   carry a word makes the interface HEAVIER, not purer.

   Three conditions carry the brief's real intent forward, and they are what
   keeps the set from looking bought:

   1. HAND-AUTHORED INLINE SVG. NO ICON DEPENDENCY, EVER. Not Lucide, not
      Heroicons, not Phosphor. The tell is not that an interface has icons — it
      is that it has someone else's.
   2. ONE DRAWING SPEC, so the set reads as one hand: a 24 px grid, round caps
      and joins, a 2 px minimum interior gap, and geometry built from the same
      circles and straight lines the eight use. The dot and the line stay the
      family's ancestors — a notification count is a dot, a live session is a
      dot, an active tab is a dot.
      ★ The stroke is 2, not the 1.7 `16` §4.2.1 names. The eight ancestors are
        drawn at 2 and cannot be redrawn — they are on a frozen page — and one
        hand matters more than the number (DEC-106).
   3. THE FORBIDDEN IMAGERY STANDS, on both surfaces: no open books, graduation
      caps, lightbulbs, mortarboards, cartoon illustrations or any other
      education cliché. This is a professional platform for people who grade
      footage for a living. A calendar is a calendar; a lightbulb is never an
      idea.

   ★ AN ICON NEVER TRAVELS ALONE IN A PRIMARY ACTION. A tab bar label plus
   icon, a table row action with an accessible name, a bookmark button with
   `aria-label` — an icon-only control ships only where the meaning is
   unambiguous and the name is ON the element. That is REQ-NFR-007, not a style
   rule, and `ui/icon-button` makes the name a required prop so it cannot be
   forgotten.

   Direction: a glyph that points flips by the LOGICAL axis, exactly as the
   chevron and the arrow above do. Everything else never mirrors.
   ══════════════════════════════════════════════════════════════════════════ */

/** البحث — the shell's search entry, and every filter box. */
export function SearchIcon({ className = "", ...props }: IconProps) {
  return (
    <Svg className={`rtl:-scale-x-100 ${className}`} {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </Svg>
  );
}

/** التصفية — the chip row's overflow, and the filter sheet. */
export function FilterIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </Svg>
  );
}

/** الترتيب — a sortable column, and the browse sort control. */
export function SortIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" />
    </Svg>
  );
}

/** الحفظ — bookmark, outline. The filled twin is `BookmarkFilledIcon`. */
export function BookmarkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4h12v16l-6-4.5L6 20z" />
    </Svg>
  );
}

/** محفوظ — bookmark, filled. The 120 ms fill is the whole animation (DEC-100). */
export function BookmarkFilledIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4h12v16l-6-4.5L6 20z" fill="currentColor" />
    </Svg>
  );
}

/** المشاركة — three nodes and two lines: the network, at icon scale. */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.3 10.8 7.4-4.3m0 11-7.4-4.3" />
    </Svg>
  );
}

/** التنزيل — a signed URL, always. Never a client-side blob (CSP). */
export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
    </Svg>
  );
}

/** الرفع — the file-drop control, and nothing else. */
export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20V9m0 0-4 4m4-4 4 4M5 5h14" />
    </Svg>
  );
}

/** التقويم — a calendar. Not a date, not an event, not a clipboard. */
export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 11h16M9 4v3m6-3v3" />
    </Svg>
  );
}

/** المؤشرات — three bars on a baseline, the tallest in the middle so the glyph
 *  implies no reading direction and never mirrors (wave 8, `platform`'s rail). */
export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h16" />
      <path d="M7.5 16.5v-5" />
      <path d="M12 16.5V6.5" />
      <path d="M16.5 16.5v-7.5" />
    </Svg>
  );
}

/** الوقت — a clock. The hands read 10:10 in both directions; it never mirrors. */
export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

/** المكان — a venue. A pin and a dot; the dot is the family's ancestor. */
export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s6-5.2 6-9.8A6 6 0 0 0 6 11.2C6 15.8 12 21 12 21z" />
      <circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** الحضور — a group. Attendance counts, the member directory. */
export function UsersIcon({ className = "", ...props }: IconProps) {
  return (
    <Svg className={`rtl:-scale-x-100 ${className}`} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3.2 3.2 0 0 1 0 5.6M17.5 14.4A5.5 5.5 0 0 1 20.5 19" />
    </Svg>
  );
}

/** العضو — one person. The account menu, a presenter row, a profile. */
export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Svg>
  );
}

/** التقييم — a rating. Staff surfaces and a presenter's own view only. */
export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"
        fill={filled ? "currentColor" : "none"}
      />
    </Svg>
  );
}

/** تم — a confirmed state. The check inside a circle, not a badge. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.4 2.4 4.6-5" />
    </Svg>
  );
}

/** خطأ — a field error. Colour is never the only channel; this is the other. */
export function AlertCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** تحذير — something needs attention but nothing has failed yet. */
export function AlertTriangleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** معلومة — a hint, never a warning. */
export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11.5V16" />
      <circle cx="12" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** القائمة — the phone drawer. Three lines; the line is an ancestor. */
export function MenuIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

/** المزيد — a row's overflow. Three dots; the dot is an ancestor. */
export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** صورة — a poster, a photo, the media box's placeholder. */
export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17" />
    </Svg>
  );
}

/** الوسم — a tag or a category. A label with a dot where it would hang. */
export function TagIcon({ className = "", ...props }: IconProps) {
  return (
    <Svg className={`rtl:-scale-x-100 ${className}`} {...props}>
      <path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.2 6.2a1.4 1.4 0 0 1-2 0z" />
      <circle cx="8.2" cy="8.2" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** الشركة — an organisation within the group. A building, three storeys of windows as dots. */
export function BuildingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M10 20.5v-3.5h4v3.5" />
      <circle cx="9.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** الهوية — the brand kit. A swatch fan: three colour chips from one pivot dot. */
export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="6" height="15.5" rx="1.5" />
      <path d="M10 8.5l4.2-2.4a1.5 1.5 0 0 1 2 .6l1 1.7a1.5 1.5 0 0 1-.5 2L10 14.2" />
      <path d="M10 17.5h8.5a1.5 1.5 0 0 0 1.5-1.5v-2a1.5 1.5 0 0 0-1.5-1.5H14" />
      <circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** الإعدادات — settings. Eight short teeth around a ring, the dot at its centre. */
export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </Svg>
  );
}

/** مقفل — a locked layer, a restricted screen, a closed registration. */
export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </Svg>
  );
}

/** الرؤية — visible. Used by the designer's layer list and the moderation queue. */
export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

/** الحذف — destructive, and always behind a dialog that names the object. */
export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 13h9l1-13M10.5 11v5m3-5v5" />
    </Svg>
  );
}

/** الرابط — a link that leaves, or a copied URL. */
export function LinkIcon({ className = "", ...props }: IconProps) {
  return (
    <Svg className={`rtl:-scale-x-100 ${className}`} {...props}>
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </Svg>
  );
}

/** الإشعارات — the bell. A dot rides it when there is an unread count. */
export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

/**
 * الرئيسية — home. Two additions the §4.2.1 list does not name and the shell
 * needs (DEC-106): this and the bell. A house is not on the brief's forbidden
 * list — that bans education clichés: books, caps, lightbulbs, mortarboards.
 * Drawn from the same straight lines as the rest, with no chimney, no door and
 * no window, because each of those is a detail that reads as a stock icon.
 */
export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5V20H4z" />
    </Svg>
  );
}
