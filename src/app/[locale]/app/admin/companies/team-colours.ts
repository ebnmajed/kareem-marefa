// SCR-048's team colour (REQ-UIX-043, DEC-183 §4.11, DEC-186 §8) — the
// seven named colours only, no free hex. The form posts a NAME; this is the
// one place a name becomes the `#rrggbb` the database stores and the check
// constraint (`0160`) enforces.
//
// The seven hexes are the exact values `src/app/globals.css` declares as
// `--color-team-*` (the lead's, read-only to this track) — kept in sync by
// a unit test the lead runs against both files, not by importing one into
// the other: `globals.css` is CSS, this module is data a Server Action can
// `.parse()` against.

export const TEAM_COLOUR_NAMES = ["silver", "tangerine", "magenta", "cyan", "gold", "violet", "mint"] as const;
export type TeamColourName = (typeof TEAM_COLOUR_NAMES)[number];

export const TEAM_COLOUR_HEX: Record<TeamColourName, string> = {
  silver: "#e9e4d6",
  tangerine: "#ff9a2e",
  magenta: "#ff4fb8",
  cyan: "#35d0ff",
  gold: "#ffd23f",
  violet: "#9b7cff",
  mint: "#3be8b0",
};

/** The reverse lookup — a stored hex back to the name a screen shows, for
 *  the row that already carries one. `null` when the hex matches none of
 *  the seven (should not happen through this screen; a defensive read, not
 *  a validator — the database's check constraint is the boundary). */
export function teamColourNameOf(hex: string | null): TeamColourName | null {
  if (hex === null) return null;
  const entry = Object.entries(TEAM_COLOUR_HEX).find(([, v]) => v === hex.toLowerCase());
  return (entry?.[0] as TeamColourName | undefined) ?? null;
}
