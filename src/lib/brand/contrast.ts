// WCAG 2.2 AA contrast — SCR-059 shows the ratio beside every colour pair
// and REFUSES a save below the threshold, rather than warning (branding
// agent definition, §"SCR-059"). Pure maths, no Supabase — importable from
// both the server action and the client-side live preview.

/** sRGB hex → relative luminance (WCAG 2.x, §1.4.3's formula). */
function relativeLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio between two `#rrggbb` colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastUse = "body" | "large" | "ui";

/** AA thresholds: 4.5:1 for body text, 3:1 for large text (≥ 24px/19px bold)
 *  and UI components/graphical objects (WCAG 2.2 SC 1.4.3, 1.4.11). */
export const AA_THRESHOLD: Record<ContrastUse, number> = {
  body: 4.5,
  large: 3,
  ui: 3,
};

export interface ContrastCheck {
  ratio: number;
  threshold: number;
  passes: boolean;
}

export function checkContrast(foreground: string, background: string, use: ContrastUse): ContrastCheck {
  const ratio = contrastRatio(foreground, background);
  const threshold = AA_THRESHOLD[use];
  return { ratio: Math.round(ratio * 100) / 100, threshold, passes: ratio >= threshold };
}
