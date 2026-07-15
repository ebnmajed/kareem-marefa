import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";

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
