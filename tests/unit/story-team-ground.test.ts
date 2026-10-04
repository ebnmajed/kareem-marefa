import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/brand/contrast";

// `StoryLive` / `StoryRecap` — a generated frame stands on the session's TEAM COLOUR with INK text (`on-team`). Every
// one of the seven team colours must carry that text at AA (4.5:1), and the live badge's coral word on its ink pill too.
// Read from `globals.css` itself, so a team colour that moves is measured, never assumed.
const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const token = (name: string) => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`--color-${name} is not a hex in globals.css`);
  return m[1];
};
const TEAMS = ["team-silver", "team-tangerine", "team-magenta", "team-cyan", "team-gold", "team-violet", "team-mint"];

describe("the story's team ground", () => {
  const ink = token("on-team");

  it.each(TEAMS)("ink on %s passes AA for body text", (team) => {
    expect(contrastRatio(ink, token(team))).toBeGreaterThanOrEqual(4.5);
  });

  it("the live badge's coral on its ink pill passes AA", () => {
    expect(contrastRatio(token("play-coral"), ink)).toBeGreaterThanOrEqual(4.5);
  });
});
