import type { EditorRailGlyph } from "@/components/ui";

// The studio rail's glyphs — REQ-UIX-107, DEC-237, the lead's (`docs/plan/notes/lead-wave23.md`).
//
// ★ NOT `ui/icons.tsx`. That file is imported by the five frozen public routes, and every change to it needs the
// four-part proof (`DEC-186` §1); eleven glyphs only the studio draws do not belong behind that gate. They are the
// house set's grammar — a 24 px grid, stroke 2, the text's colour, round caps — so they sit beside it without a seam.
//
// Inline SVG our own code draws is not an upload: invariant 11 is about bytes a person sends us.

const PATHS: Record<EditorRailGlyph, React.ReactNode> = {
  elements: <path d="M12 5v14M5 12h14" />,
  add: <path d="M12 5v14M5 12h14" />,
  fields: <path d="M4 7h16M4 12h10M4 17h7" />,
  uploads: (
    <>
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
      <path d="M4 20h16" />
    </>
  ),
  brand: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" />
    </>
  ),
  styles: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  checks: <path d="m5 12 5 5 9-10" />,
  layer: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  layouts: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16M3 12h18" />
    </>
  ),
  block: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
};

export function StudioGlyph({ name, size = 18 }: { name: EditorRailGlyph; size?: number }) {
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
    >
      {PATHS[name]}
    </svg>
  );
}
