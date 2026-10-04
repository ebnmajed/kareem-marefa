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
    expect(ownsTopRow("/ar/app/members/m1/x")).toBe(false);
  });
  it("my proposal is immersive with its own bottom bar; propose and the resubmit form keep the tab bar (DEC-214 §3)", () => {
    expect(isImmersive("/ar/app/propose/p1")).toBe(true);
    expect(hasActionBar("/ar/app/propose/p1")).toBe(true);
    expect(isImmersive("/ar/app/propose")).toBe(false);
    expect(isImmersive("/ar/app/propose/p1/edit")).toBe(false);
    expect(hasNavRail("/ar/app/propose")).toBe(true);
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

describe("wave 20 — the hub, settings and the boards draw their own phone top row (DEC-217, REQ-UIX-070)", () => {
  it.each([
    "/ar/app/me",
    "/ar/app/me/points",
    "/ar/app/me/certificates",
    "/ar/app/me/bookmarks",
    "/ar/app/me/calendar",
    "/ar/app/me/notifications",
    "/ar/app/me/settings",
    "/en/app/me/settings",
    "/ar/app/leaderboards",
    "/ar/app/leaderboards/companies",
  ])("%s", (p) => {
    expect(ownsTopRow(p)).toBe(true);
  });
  // ★ wave 26 (DEC-251 §3.5): an expectation moved — M13 draws privacy (`m13/Privacy.dc.html`), so it owns its row.
  it("privacy too, since M13 draws it — but not a deeper path", () => {
    expect(ownsTopRow("/ar/app/me/privacy")).toBe(true);
    expect(ownsTopRow("/ar/app/me/points/x")).toBe(false);
    expect(ownsTopRow("/ar/app/leaderboards/companies/x")).toBe(false);
  });
  it("and every one keeps the tab bar and the rail", () => {
    expect(isImmersive("/ar/app/me/settings")).toBe(false);
    expect(hasNavRail("/ar/app/me/settings")).toBe(true);
    expect(hasNavRail("/ar/app/leaderboards")).toBe(true);
  });
});
