// The shaping parity suite's seven cases (docs/plan/06-visual-designer.md §9.2).
//
// Each targets a specific way Arabic breaks silently — a way that a Latin
// smoke test passes and a human reviewer misses unless they read Arabic.

export const CASES = [
  {
    id: 'lam-alef',
    text: 'لا إله إلا الله',
    catches: 'ligature substitution dropped (rlig/liga missing from a subset)',
    // لا is ONE glyph, not two. If a subsetter drops the ligature, the string
    // renders as disconnected ل + ا and the advance width grows measurably.
    width: 600,
  },
  {
    id: 'stacked-tashkeel',
    text: 'مُحَمَّدٌ',
    catches: 'mark/mkmk positioning; line boxes clipping diacritics',
    // Four marks, one of them stacked (shadda + damma on the same base). Marks
    // are drawn above the em box, so a clipped line box eats them.
    width: 600,
  },
  {
    id: 'mixed-script',
    text: 'جلسة عن Next.js 16 في 2026',
    catches: 'bidi reordering, numeral run isolation',
    width: 600,
  },
  {
    id: 'mirrored-punctuation',
    text: '(الجلسة الأولى) — «كريم معرفة»؟',
    catches: 'bracket and quote mirroring',
    width: 600,
  },
  {
    id: 'long-word-break',
    text: 'استراتيجيات المحتوى الرقمي والتحول المؤسسي',
    catches: 'line-break behaviour at the shaping boundary',
    // Deliberately narrow: forces breaks mid-phrase, where joining behaviour
    // at a line end is decided.
    width: 200,
  },
  {
    id: 'numeral-systems',
    text: '٣ جلسات · 3 sessions · ١٢٣ / 123',
    catches: 'numeral-system consistency (A30)',
    // Both systems on one line ON PURPOSE — this proves the renderer handles a
    // mixed line, it does not endorse shipping one (06 §9.2).
    width: 600,
  },
  {
    id: 'autofit-limit',
    text: 'ورشة عملية: كيف اختصرنا وقت إعداد التقارير إلى النصف',
    catches: 'the shrink/wrap decision at the auto-fit boundary',
    // Sized at the template minimum, where editor and export are most likely
    // to disagree by one pixel that becomes a wrapped line.
    width: 420,
    fontSize: 28,
  },
]

export const DEFAULT_FONT_SIZE = 40
export const FAMILY = 'IBM Plex Sans Arabic'
