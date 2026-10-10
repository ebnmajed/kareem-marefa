// Wave 29, PR C — which move a navigation plays (DEC-280 §5 – §6; REQ-UIX-121 … REQ-UIX-130). `src/lib/ui/nav-motion.ts`.
//
// The moves are CSS keyed on `<html data-nav>`; this module decides the kind. A declared kind wins; a link to a child of
// this screen is a push; a tab's side is its order; the console and the platform never carry a kind; a jump hands the
// tapped card's poster to the event's skeleton.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearNavKind,
  handPoster,
  handedPoster,
  isChildPath,
  takeHandedPoster,
  isStillPath,
  kindOfClick,
  setNavKind,
  settleNavKind,
  switchKind,
} from "@/lib/ui/nav-motion";

const SESSION = "11111111-1111-4111-8111-111111111111";

function click(target: Element, init: Partial<MouseEvent> = {}) {
  return { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, target, ...init } as MouseEvent;
}

afterEach(() => {
  clearNavKind();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("kindOfClick", () => {
  it("a declared kind wins, from anywhere inside the link", () => {
    document.body.innerHTML = `<a href="/ar/app/sessions/${SESSION}" data-nav-kind="jump"><span id="in">x</span></a>`;
    expect(kindOfClick(click(document.getElementById("in")!))).toBe("jump");
  });

  it("a link to a child of this screen is a push; to anywhere else, nothing", () => {
    window.history.replaceState(null, "", "/ar/app/me");
    document.body.innerHTML = `<a id="child" href="/ar/app/me/settings">s</a><a id="other" href="/ar/app/leaderboards">l</a><a id="parent" href="/ar/app">h</a>`;
    expect(kindOfClick(click(document.getElementById("child")!))).toBe("push");
    expect(kindOfClick(click(document.getElementById("other")!))).toBeNull();
    expect(kindOfClick(click(document.getElementById("parent")!))).toBeNull();
  });

  it("a modified click, a new tab, a download or another button asks for nothing", () => {
    window.history.replaceState(null, "", "/ar/app/me");
    document.body.innerHTML = `<a id="a" href="/ar/app/me/settings" data-nav-kind="push">s</a><a id="b" href="/ar/app/me/settings" target="_blank">s</a><a id="c" href="/ar/app/me/x.pdf" download>d</a>`;
    const a = document.getElementById("a")!;
    expect(kindOfClick(click(a, { metaKey: true }))).toBeNull();
    expect(kindOfClick(click(a, { ctrlKey: true }))).toBeNull();
    expect(kindOfClick(click(a, { button: 1 }))).toBeNull();
    expect(kindOfClick(click(a, { defaultPrevented: true }))).toBeNull();
    expect(kindOfClick(click(document.getElementById("b")!))).toBeNull();
    expect(kindOfClick(click(document.getElementById("c")!))).toBeNull();
  });

  it("a link never asks for `back` or `none` — history owns back", () => {
    document.body.innerHTML = `<a id="a" href="/x" data-nav-kind="back">x</a><a id="b" href="/x" data-nav-kind="none">x</a>`;
    expect(kindOfClick(click(document.getElementById("a")!))).toBeNull();
    expect(kindOfClick(click(document.getElementById("b")!))).toBeNull();
  });
});

describe("settleNavKind — a settle clears its own navigation's kind, never the next tap's", () => {
  it("clears a kind set before the commit", () => {
    vi.useFakeTimers();
    setNavKind("push", "/ar/app/me");
    settleNavKind();
    vi.advanceTimersByTime(1000);
    expect(document.documentElement.dataset.nav).toBeUndefined();
    vi.useRealTimers();
  });

  it("★ keeps a kind set AFTER the commit — a quick next tap's jump survives the last page's settle", () => {
    vi.useFakeTimers();
    settleNavKind();
    vi.advanceTimersByTime(300);
    setNavKind("jump", "/ar/app");
    vi.advanceTimersByTime(1000);
    expect(document.documentElement.dataset.nav).toBe("jump");
    vi.useRealTimers();
  });
});

describe("isChildPath", () => {
  it("strictly below, never the same screen or a sibling that shares a prefix", () => {
    const at = (p: string) => new URL(p, location.href);
    expect(isChildPath("/ar/app/sessions/x", at("/ar/app/sessions/x/check-in"))).toBe(true);
    expect(isChildPath("/ar/app/sessions/x/", at("/ar/app/sessions/x/rate"))).toBe(true);
    expect(isChildPath("/ar/app/sessions/x", at("/ar/app/sessions/x"))).toBe(false);
    expect(isChildPath("/ar/app/me", at("/ar/app/members"))).toBe(false);
  });
});

describe("switchKind — the tapped tab's side, in tab order (REQ-UIX-125)", () => {
  it("a later tab arrives from the inline-end, an earlier from the start, the current asks for nothing", () => {
    expect(switchKind(3, 1)).toBe("switch-end");
    expect(switchKind(0, 2)).toBe("switch-start");
    expect(switchKind(2, 2)).toBeUndefined();
    expect(switchKind(0, -1)).toBe("switch-end");
  });
});

describe("the console and the platform cut (REQ-UIX-129)", () => {
  it("isStillPath — locale-prefixed or not, and never a member path that merely starts alike", () => {
    expect(isStillPath("/ar/app/admin")).toBe(true);
    expect(isStillPath("/en/app/platform/orgs")).toBe(true);
    expect(isStillPath("/app/admin/members")).toBe(true);
    expect(isStillPath("/ar/app/administrator")).toBe(false);
    expect(isStillPath("/ar/app")).toBe(false);
  });

  it("setNavKind sets the kind on a member screen and clears it inside the staff tree", () => {
    setNavKind("push", "/ar/app/me");
    expect(document.documentElement.dataset.nav).toBe("push");
    setNavKind("push", "/ar/app/admin/sessions");
    expect(document.documentElement.dataset.nav).toBeUndefined();
    setNavKind("jump", "/ar/app");
    setNavKind("none", "/ar/app");
    expect(document.documentElement.dataset.nav).toBeUndefined();
  });
});

describe("the poster handoff (REQ-UIX-122, REQ-UIX-127)", () => {
  function card(id: string, decoded: boolean) {
    document.body.innerHTML = `<a id="card" href="/ar/app/sessions/${id}" data-nav-kind="jump"><img id="img" src="/p.webp" /></a>`;
    const img = document.getElementById("img") as HTMLImageElement;
    Object.defineProperty(img, "currentSrc", { value: decoded ? new URL("/p.webp", location.href).href : "" });
    Object.defineProperty(img, "naturalWidth", { value: decoded ? 800 : 0 });
    Object.defineProperty(img, "naturalHeight", { value: decoded ? 1000 : 0 });
    return document.getElementById("card")!;
  }

  it("hands the tapped card's decoded poster to that session's skeleton, and to no other", () => {
    handPoster(card(SESSION, true));
    expect(handedPoster(SESSION.toUpperCase())).toEqual({ sessionId: SESSION, src: new URL("/p.webp", location.href).href, ratio: 0.8, from: null });
    expect(handedPoster("22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("is taken once: a later visit by any other path draws the skeleton's own box", () => {
    handPoster(card(SESSION, true));
    expect(takeHandedPoster(SESSION)).not.toBeNull();
    expect(takeHandedPoster(SESSION)).toBeNull();
  });

  it("hands nothing when the card's poster is a placeholder or not decoded yet", () => {
    handPoster(card(SESSION, false));
    expect(handedPoster(SESSION)).toBeNull();
  });
});
