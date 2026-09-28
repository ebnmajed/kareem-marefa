// docs/design/assets/icons/icons-additions.tsx
// Fifteen glyphs the direction needs, drawn to the house conventions: 24px grid, 2px stroke,
// currentColor, round caps and joins, aria-hidden by default. Merge them into
// src/components/ui/icons.tsx in whatever shape that file uses (this file mirrors a plain
// component-per-glyph shape; adapt the export if the house set is a name→path map).
// No library, ever: every path here was authored by hand.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const FlameIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" /></Icon>
);
export const TrophyIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8 21h8M9 17h6" /></Icon>
);
export const CompassIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-4 2 2-6z" /></Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const TicketIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2" /></Icon>
);
export const CoinIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><path d="M12 9.5v5M10 12h4" /></Icon>
);
export const BoltIcon = (p: IconProps) => (
  <Icon {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></Icon>
);
export const StarIcon = (p: IconProps) => (
  <Icon {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></Icon>
);
export const PinIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z" /><circle cx="12" cy="10" r="2" /></Icon>
);
export const CameraIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></Icon>
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></Icon>
);
export const CalendarCheckIcon = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></Icon>
);
/** Points toward the inline start; the pair mirrors under [dir=rtl] via CSS, not a second glyph. */
export const ChevronStartIcon = (p: IconProps) => (
  <Icon {...p}><path d="m15 5-7 7 7 7" /></Icon>
);
export const ChevronEndIcon = (p: IconProps) => (
  <Icon {...p}><path d="m9 5 7 7-7 7" /></Icon>
);
export const PauseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M8 5v14M16 5v14" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
);

/* Directional glyphs mirror by CSS, never by a second drawing (REQ-INT-001):
   [dir="rtl"] .icon-directional { transform: scaleX(-1); }
   Apply the class to ChevronStart/End only; the rest are symmetric or non-directional. */
