import type { ReactNode } from "react";

// The block library's glyphs — wave 23, REQ-UIX-112. Inline, `aria-hidden` paths our own code draws on a 24 px grid
// with stroke 2 in the text's colour, as `AdminEmailAdd.dc.html` draws them. Not `ui/icons.tsx`: the five public routes
// import it, and every change there needs the four-part proof (`DEC-186` §1). Inline SVG we draw is not an upload
// (invariant 11 is about bytes a person sends, and nothing here reaches a mail).

const PATHS: Record<string, ReactNode> = {
  paragraph: <path d="M4 7h16M4 12h10M4 17h7" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-8 8" />
    </>
  ),
  button: <rect x="3" y="8" width="18" height="8" rx="4" />,
  divider: <path d="M4 12h16" />,
  spacer: <path d="M4 6h16M4 18h16" />,
  session_card: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16" />
    </>
  ),
  poster: <rect x="5" y="3" width="14" height="18" rx="2" />,
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
    </>
  ),
  certificate: (
    <>
      <path d="M4 5h16v12H4z" />
      <path d="M9 21l3-2 3 2v-4H9z" />
    </>
  ),
  logo: <circle cx="12" cy="12" r="9" />,
  social: (
    <>
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="m8 11 8-4M8 13l8 4" />
    </>
  ),
};

export function BlockGlyph({ type }: { type: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[type] ?? PATHS.paragraph}
    </svg>
  );
}
