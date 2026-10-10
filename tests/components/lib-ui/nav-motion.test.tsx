// Navigation motion after DEC-285 — `src/lib/ui/nav-motion.ts`. One move per tap: the tap stores it, the FIRST view
// transition takes it as its type, and nothing is timed. Also here: the console's stillness, a tab's side, and the
// poster handed from a tapped card to the event page it opens.
import { afterEach, describe, expect, it } from "vitest";
import { forgetPendingKind, handPoster, handedPoster, installNavMotion, isStillPath, kindOfClick, noteNavigation, pendingKind, startWithMove, switchKind, takeHandedPoster } from "@/lib/ui/nav-motion";

const SESSION = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  takeHandedPoster(SESSION);
  forgetPendingKind();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
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

  it("hands the tapped card's decoded poster to that session's page, and to no other", () => {
    handPoster(card(SESSION, true));
    expect(handedPoster(SESSION.toUpperCase())).toEqual({ sessionId: SESSION, src: new URL("/p.webp", location.href).href, ratio: 0.8, from: null });
    expect(handedPoster("22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("is taken once: a later visit by any other path draws the skeleton's box", () => {
    handPoster(card(SESSION, true));
    expect(takeHandedPoster(SESSION)).not.toBeNull();
    expect(takeHandedPoster(SESSION)).toBeNull();
  });

  it("hands nothing when the card's poster is a placeholder or not decoded yet", () => {
    handPoster(card(SESSION, false));
    expect(handedPoster(SESSION)).toBeNull();
  });

  it("a plain click on a jump link hands its poster; a modified click does not", () => {
    const off = installNavMotion();
    const a = card(SESSION, true);
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: true }));
    expect(handedPoster(SESSION)).toBeNull();
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(handedPoster(SESSION)).not.toBeNull();
    off();
  });

  it("★ nothing is handed inside the console", () => {
    window.history.replaceState(null, "", "/ar/app/admin/sessions");
    const off = installNavMotion();
    card(SESSION, true).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(handedPoster(SESSION)).toBeNull();
    off();
  });
});

describe("one move per tap — the first transition takes it (DEC-285)", () => {
  function click(target: Element, init: Partial<MouseEvent> = {}) {
    return { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, target, ...init } as MouseEvent;
  }

  it("kindOfClick reads a link's move; never from a modified click, a new tab or an unknown kind", () => {
    document.body.innerHTML = `<a id="a" href="/x" data-nav-kind="push"><span id="in">x</span></a><a id="b" href="/x" data-nav-kind="back">x</a><a id="c" href="/x" target="_blank" data-nav-kind="jump">x</a>`;
    expect(kindOfClick(click(document.getElementById("in")!))).toBe("push");
    expect(kindOfClick(click(document.getElementById("in")!, { metaKey: true }))).toBeNull();
    expect(kindOfClick(click(document.getElementById("b")!))).toBeNull();
    expect(kindOfClick(click(document.getElementById("c")!))).toBeNull();
  });

  function fakeStart() {
    const calls: { arg: unknown; types: Set<string> }[] = [];
    const original = (arg?: unknown) => {
      const t = { types: new Set<string>() } as unknown as ViewTransition;
      calls.push({ arg, types: (t as unknown as { types: Set<string> }).types });
      return t;
    };
    return { calls, original };
  }
  const tap = (kind: string) => {
    document.body.innerHTML = `<a id="a" href="/x" data-nav-kind="${kind}">x</a>`;
    document.getElementById("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  };

  it("★ a transition whose update changes no path (the old page's pending dot) does NOT take the move", () => {
    const off = installNavMotion();
    tap("jump");
    const { calls, original } = fakeStart();
    startWithMove(original, { update: () => undefined });
    (calls[0].arg as { update: () => unknown }).update();
    expect([...calls[0].types]).toEqual([]);
    expect(pendingKind()).toBe("jump");

    // The navigation's own transition: the path changes during its update — it takes the move, once.
    startWithMove(original, { update: () => noteNavigation() });
    (calls[1].arg as { update: () => unknown }).update();
    expect([...calls[1].types]).toEqual(["jump"]);
    expect(pendingKind()).toBeNull();

    // And a later transition — the skeleton's page arriving — has no type: it crossfades.
    startWithMove(original, { update: () => noteNavigation() });
    (calls[2].arg as { update?: () => unknown }).update?.();
    expect([...calls[2].types]).toEqual([]);
    off();
  });

  it("★ inside the console a tap stores nothing", () => {
    window.history.replaceState(null, "", "/ar/app/admin/sessions");
    const off = installNavMotion();
    document.body.innerHTML = `<a id="a" href="/ar/app/admin/x" data-nav-kind="push">x</a>`;
    document.getElementById("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(pendingKind()).toBeNull();
    off();
  });
});
