// The `(dev)` route group — DEC-083. A route group adds no URL segment, so
// `/[locale]/(dev)/ui` is `/ar/ui`.
//
// It sits OUTSIDE `/app`, deliberately: it must not inherit the shell (the
// gallery is where primitives are reviewed in isolation, not in a page), and
// it must not require a session (`scripts/visual-diff.mjs` has no auth path).
// `proxy.ts` 404s it unless `KAREEM_GALLERY=1`.
//
// ★ Wave 17 (DEC-199): it renders no scope of its own and paints no ground. The
// gallery stands two scopes side by side, the dark ground and the light one, and
// scopes do not nest; the first of them is the page's root, and the document's
// ground follows it (`globals.css`).
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
