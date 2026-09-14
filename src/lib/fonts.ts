import { Amiri, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Reem_Kufi } from "next/font/google";

// Latin is the body face only on /en; on the Arabic-primary routes it is just
// the small bilingual wordmark. Skip its critical preload so the ~heavy Arabic
// face isn't competing with it on first paint — it still loads via display:swap
// with adjustFontFallback (default) keeping any swap-CLS low. Measure /en LCP
// before/after; revert to preload:true if the /en cold-load FOUT is noticeable.
export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
  preload: false,
});

export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-arabic",
  display: "swap",
});

// The two display faces of the designer's baseline library (06 §7.1, §3.3):
// a Kufi face for posters and a Naskh face for certificates. Declared here so
// next/font materialises their bytes into the build, from where
// `fonts:extract` pins them into packages/fonts by SHA-256 — the same path
// Plex takes, so the editor, the worker's Chromium and LibreOffice read one
// set (REQ-DSG-016, DEC-049). Not applied to any route and never preloaded:
// the marketing pages must not pay for them, and the designer loads a face by
// hash from the manifest, never through a CSS variable.
export const reemKufi = Reem_Kufi({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-reem-kufi",
  display: "swap",
  preload: false,
});

export const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
  preload: false,
});
