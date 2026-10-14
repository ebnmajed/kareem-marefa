import localFont from "next/font/local";

// ★★ EVERY FAMILY IS SELF-HOSTED (DEC-292, the owner, 2026-10-14 — completing DEC-203). The two Plex faces were the
// last fetched from Google Fonts at build time, and that fetch kept failing CI builds («Can't resolve
// '@vercel/turbopack-next/internal/font/google/font'»). The app now reads the SAME bytes the worker already uses —
// `packages/fonts`, pinned by SHA-256 (invariant 12) — through `next/font/local`, so no build reaches Google. The files
// and the ranges are the ones `next/font/google` emitted, so a page renders identically; only the generated family
// name changes, and the register form's fingerprint was re-recorded for it in the same commit (invariant 1).

// Latin is the body face only on /en; on the Arabic-primary routes it is just
// the small bilingual wordmark. Skip its critical preload so the ~heavy Arabic
// face isn't competing with it on first paint — it still loads via display:swap
// with adjustFontFallback (default) keeping any swap-CLS low.
// One variable file for 400 – 600, as Google served it.
export const plexSans = localFont({
  src: "../../packages/fonts/056e4e2459f57a0033c8c9c844ff19d6e42ac8602027803d4345823bcc939818.woff2",
  weight: "400 600",
  variable: "--font-plex",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// Plex Sans Arabic, one call per script (`next/font/local` applies one `unicode-range` to a call). ★ The Arabic call
// carries NO metric fallback: its generated «… Fallback» would be Arial, which HAS digits, so it would answer every
// number before the Latin file is asked (as the Baloo note below explains). The Latin call carries the fallback, and
// the stack in `globals.css` is Arabic, then Latin, then Plex Sans. Only the Arabic file is preloaded, as before.
const plexArabicArabic = localFont({
  src: [
    { path: "../../packages/fonts/4ed189e8653e9303ec1e1448a6025f838ecd19fe4a5f4f7889b8394b3c5378fb.woff2", weight: "400", style: "normal" },
    { path: "../../packages/fonts/bf2b68e78ca6e9c6e560634ecc33c1f11947b9ffaff1b6d9b42730ce85f696da.woff2", weight: "500", style: "normal" },
    { path: "../../packages/fonts/0ccee44455f545eb6b4083f77e5d15e7c9cd514007870167c8c69d1ba7631e26.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+6??,U+750-77F,U+870-88E,U+890-891,U+897-8E1,U+8E3-8FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1" }],
});
const plexArabicLatin = localFont({
  src: [
    { path: "../../packages/fonts/4a917a99a5b6acbe3b56887d1a8396fcd7d2112e0e4796f252c0859106679153.woff2", weight: "400", style: "normal" },
    { path: "../../packages/fonts/2c348d103970c93c7b817a5bee77406a5861200390df6bd751d2d1bd7071e1af.woff2", weight: "500", style: "normal" },
    { path: "../../packages/fonts/08b108227ae9cd53d2b8e9fc442e06a1f4884e5cf2d26c9216ec386227de74fd.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-arabic-latin",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
/** Both scripts' variables, for the locale layout's `<html>`. */
export const plexArabic = { variable: `${plexArabicArabic.variable} ${plexArabicLatin.variable}` };

// ★★ THE THREE APP-ONLY FAMILIES ARE SELF-HOSTED (DEC-203, the owner, 2026-09-30).
// Reem Kufi, Amiri and Baloo Bhaijaan 2 were fetched from Google Fonts at every
// build, like the two Plex faces above. On 2026-09-29 that fetch failed four CI
// builds in a row (DEC-198 §4), and from wave 17 the display face is on every
// screen of the app. Their bytes were already in `packages/fonts`, pinned by
// SHA-256, because the worker needs them; now the app reads THOSE files through
// `next/font/local`, so the three no longer depend on Google being reachable.
//
// ★ The two Plex faces followed on 2026-10-14 (DEC-292, above): no family is fetched from Google any more.
//
// ★ ONE FILE PER SCRIPT, ONE `localFont()` PER FILE. Google serves a family as
// several files, each with a `unicode-range`; `next/font/local` applies one set
// of descriptors to a whole call. So each script is its own call, carrying
// Google's own range for that subset — the same ranges the build emitted before,
// which is also what `scripts/fonts/extract.mjs` reads to tell Arabic from Latin.
// The bytes are the manifest's, by name: `fonts:check` compares what the build
// emits with the manifest by hash, exactly as it did.
// ★ The ranges are written out in every call: the font loader runs at compile time and
// refuses anything but a literal («Font loader values must be explicitly written
// literals»), so they cannot be shared through a constant.

// The two display faces of the designer's baseline library (06 §7.1, §3.3):
// a Kufi face for posters and a Naskh face for certificates. Declared here so
// the build carries their bytes beside Plex's and `fonts:check` can hold the
// build to the manifest (REQ-DSG-016, DEC-049). Not applied to any route and
// never preloaded: the marketing pages must not pay for them, and the designer
// loads a face by hash from the manifest, never through a CSS variable.
// Reem Kufi is one variable file per script, 400 to 700.
export const reemKufi = localFont({
  src: "../../packages/fonts/71b89239d93ca976dd637cfe6bbac664412c2713c73e86893b810ea61dd2b612.woff2",
  weight: "400 700",
  variable: "--font-reem-kufi",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+6??,U+750-77F,U+870-88E,U+890-891,U+897-8E1,U+8E3-8FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1" }],
});
export const reemKufiLatin = localFont({
  src: "../../packages/fonts/99554d5210754377fe095595168cd44ea16fa84c6c21b3a37157f58a5fd66e8a.woff2",
  weight: "400 700",
  variable: "--font-reem-kufi-latin",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

export const amiri = localFont({
  src: [
    { path: "../../packages/fonts/4c2750cf6100ce8854fa06f67c875263bbc76bf80e8f9d4808a54fdb804d374e.woff2", weight: "400", style: "normal" },
    { path: "../../packages/fonts/1313bcd0bcb23aa414a601c41d7cd3e751a00f80ae72f0d5dad8acdba04f836f.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-amiri",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+6??,U+750-77F,U+870-88E,U+890-891,U+897-8E1,U+8E3-8FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1" }],
});
export const amiriLatin = localFont({
  src: [
    { path: "../../packages/fonts/06649aaf429d76e50721c2ad2115bf8cff7c4ee34ad21725aee7c36ccbf222ac.woff2", weight: "400", style: "normal" },
    { path: "../../packages/fonts/25feffc5815d323a2eb4daef379697d0ebffff34367ee8b2560e5a0e9a54fa23.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-amiri-latin",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
  declarations: [{ prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});

// The interface's display face — «ساحة اللعب», DEC-183 §4.4 and §4.5,
// REQ-UIX-029. Headings inside the playground's scope, big numbers, the label
// of a primary action, stickers. One variable file per script, 700 to 800.
//
// ★ Reem Kufi stays the baseline poster templates' face. This one is ADDED,
// so no template and no parity golden moves.
//
// ★ THE ARABIC FACE CARRIES NO METRIC FALLBACK, AND THAT IS LOAD-BEARING. Its
// subset has no digits (DEC-185 §5): `730` and `+` come from the Latin file. A
// generated «… Fallback» family beside the Arabic one is Arial with adjusted
// metrics, and Arial HAS digits — so it would answer for every number before
// the Latin file is asked, and the big numbers would be drawn in Arial. The
// stack is Arabic, then Latin with its fallback (`--display-face`, globals.css).
//
// Never preloaded and applied to no public route: the variables are set on the
// playground's scope (`ui/scope.tsx`) alone.
const balooArabic = localFont({
  src: "../../packages/fonts/ddfc8d7ce4a727b666b57681c4394688814573e601946bfa49f9abc10ee0ffce.woff2",
  weight: "700 800",
  variable: "--font-baloo",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+6??,U+750-77F,U+870-88E,U+890-891,U+897-8E1,U+8E3-8FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1" }],
});
const balooLatin = localFont({
  src: "../../packages/fonts/9716a70e65cec6997acad8a854cf3510169faa76884d70f7c6f043b722c9e0cc.woff2",
  weight: "700 800",
  variable: "--font-baloo-latin",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
/** Both scripts' variables, for the one element that carries the scope's class. */
export const balooBhaijaan = { variable: `${balooArabic.variable} ${balooLatin.variable}` };
