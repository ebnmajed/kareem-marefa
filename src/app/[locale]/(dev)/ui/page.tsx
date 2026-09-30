import { setRequestLocale } from "next-intl/server";
import { Playground } from "./playground";

// The component gallery — `16` §4.3, DEC-083, REQ-UIX-001.
//
// It is NOT decoration. It is three things at once:
//   · where the 390 px RTL review happens, for primitives that have no screen
//     of their own yet;
//   · where `npm run visual` takes the design system's regression baseline —
//     which is the reason it is unauthenticated: `scripts/visual-diff.mjs`
//     drives a browser at public URLs and has no auth path at all;
//   · where a teammate checks whether a primitive already EXISTS before
//     writing a twenty-first input.
//
// ★★ WAVE 17 (DEC-199): THE WHOLE PAGE IS «ساحة اللعب». Until now its first half
// stood OUTSIDE the scope, in the old design, and its second half inside — which
// was true to the product in wave 15, when no screen had adopted the scope, and
// is exactly the mixture the owner opened on a phone and called a Frankenstein.
// The playground is the product's only visual language now, so the gallery shows
// nothing else: every primitive, on the scope's two grounds, from one demo each
// (`./demos/<primitive>.tsx`, wired in `./playground.tsx`). The old look is on
// the public site alone until its own wave, and `npm run visual` holds it there.
//
// ★ It lives in `(dev)`, not `/app/admin/ui`: `app/admin/**` is `console`'s, and
// an admin-gated route is not capturable by the harness we have.
//
// ★ It is gated at the EDGE, in `proxy.ts`: 404 unless `KAREEM_GALLERY=1`,
// which `visual-diff.mjs` sets when it spawns `next start`.
//
// It reads NO DATA. Every value is a literal, which is what makes it
// deterministic enough to diff.

export const metadata = { robots: { index: false, follow: false } };

export default async function GalleryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Playground />;
}
