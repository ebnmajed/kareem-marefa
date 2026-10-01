import { describe, expect, it } from "vitest";
import { hasActionBar, hasNavRail, isFullScreen, isImmersive, ownsTopRow } from "@/components/shell/shell-routes";
import { MEMBERS, NAV } from "@/components/shell/nav-items";

// The frame's four additions for batch B (DEC-213 §3, STORY-UIX-051). The route
// rules are the shell's one place of truth, so they are pinned here, path by path.

const S = "/ar/app/sessions/00000000-0000-0000-0000-000000000001";

describe("wave 19 — the viewer is full-screen at every width (DEC-213 §3.1)", () => {
  it("only the material viewer", () => {
    expect(isFullScreen(`${S}/materials/abc`)).toBe(true);
    expect(isFullScreen(`/en/app/sessions/x/materials/abc`)).toBe(true);
    expect(isFullScreen(`${S}/materials`)).toBe(false);
    expect(isFullScreen(S)).toBe(false);
    expect(isFullScreen(`${S}/rate`)).toBe(false);
    expect(isFullScreen(null)).toBe(false);
  });
  it("and it is immersive, so no rail and no tab bar", () => {
    expect(isImmersive(`${S}/materials/abc`)).toBe(true);
    expect(hasNavRail(`${S}/materials/abc`)).toBe(false);
  });
});

describe("wave 19 — five screens draw their own phone top row (DEC-213 §3.2)", () => {
  it.each([`${S}/rate`, "/ar/app/propose", "/ar/app/propose/p1", "/ar/app/propose/p1/edit", "/ar/app/members", "/ar/app/members/m1"])("%s", (p) => {
    expect(ownsTopRow(p)).toBe(true);
  });
  it("and wave 18's stay as they were", () => {
    expect(ownsTopRow("/ar/app/sessions")).toBe(true);
    expect(ownsTopRow(S)).toBe(true);
    expect(ownsTopRow(`${S}/check-in`)).toBe(true);
    expect(ownsTopRow("/ar/app")).toBe(false);
    expect(ownsTopRow("/ar/app/me")).toBe(false);
    expect(ownsTopRow("/ar/app/leaderboards")).toBe(false);
    expect(ownsTopRow("/ar/app/members/m1/x")).toBe(false);
  });
  it("rate carries a bottom action bar; the viewer does not", () => {
    expect(hasActionBar(`${S}/rate`)).toBe(true);
    expect(hasActionBar(`${S}/check-in`)).toBe(true);
    expect(hasActionBar(`${S}/materials/abc`)).toBe(false);
    expect(hasActionBar(`${S}/host`)).toBe(false);
  });
});

describe("wave 19 — «الأعضاء» and «حسابي» (DEC-213 §3.3)", () => {
  const me = NAV.find((n) => n.key === "me")!;
  it("«الأعضاء» is current on the directory and on a profile", () => {
    expect(MEMBERS.current("/app/members")).toBe(true);
    expect(MEMBERS.current("/app/members/m1")).toBe(true);
    expect(MEMBERS.current("/app/me")).toBe(false);
  });
  it("«حسابي» is current on the hub and never on another member's profile", () => {
    expect(me.current("/app/me")).toBe(true);
    expect(me.current("/app/me/points")).toBe(true);
    expect(me.current("/app/members/m1")).toBe(false);
  });
  it("the tab bar keeps five — the directory is not a tab (DEC-205 §2)", () => {
    expect(NAV.map((n) => n.key)).toEqual(["home", "sessions", "propose", "board", "me"]);
  });
});
