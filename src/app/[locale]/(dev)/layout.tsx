// The `(dev)` route group — DEC-083. A route group adds no URL segment, so
// `/[locale]/(dev)/ui` is `/ar/ui`.
//
// It sits OUTSIDE `/app`, deliberately: it must not inherit the shell (the
// gallery is where primitives are reviewed in isolation, not in a page), and
// it must not require a session (`scripts/visual-diff.mjs` has no auth path).
// `proxy.ts` 404s it unless `KAREEM_GALLERY=1`.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-fg-body">{children}</div>;
}
