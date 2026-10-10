import { boxOf, flyFrom, type Box } from "./poster-flight";

// Navigation motion — WHICH move a navigation plays (DEC-280 §5 – §6; REQ-UIX-121 … REQ-UIX-130; `TRANSITIONS.md`).
//
// The moves themselves are CSS keyed on `<html data-nav>` (`globals.css`, «navigation motion»); this module only sets
// the kind, at the moment the member asks for the move, and clears it once the move has had its time:
//
//   · a press on a link that carries `data-nav-kind` (`ui/link`'s `nav` prop), or a link to a child of this screen
//     (a push) — the press is immediate, the move plays
//     when the next screen or its skeleton commits, because the attribute simply waits for React's transition;
//   · the browser's back and forward — back is the mirror of a push, forward plays a push again (REQ-UIX-124);
//   · nothing else. A refresh, a redirect after a form or a link with no kind carries no kind, and the CSS cuts.
//
// ★ The console and the platform cut (DEC-280 §6, REQ-UIX-053): `isStillPath()` is the one test, read by the shell's
// boundary and by every setter here, so a press or a back inside the staff tree can never leave a kind behind.
// ★ Nothing here animates: no keyframe, no duration. Reduced motion is the CSS's (every move a cut), and the press,
// being a `:active` transition, still shows as a step.

export const NAV_KINDS = ["jump", "push", "back", "switch-start", "switch-end", "none"] as const;
export type NavKind = (typeof NAV_KINDS)[number];

/** The kinds a link may ask for — `back` belongs to history, `none` is the absence of one. */
export type LinkNavKind = Exclude<NavKind, "back" | "none">;

const STILL = /^\/(?:[a-z]{2}\/)?app\/(?:admin|platform)(?:\/|$)/;

/** The console and the platform never move (REQ-UIX-129). Locale-prefixed or not. */
export function isStillPath(pathname: string): boolean {
  return STILL.test(pathname);
}

export function isNavKind(value: unknown): value is NavKind {
  return typeof value === "string" && (NAV_KINDS as readonly string[]).includes(value);
}

// Long enough for the slowest move (`--dur-play`, 480 ms) to finish after a slow commit; a navigation that has not
// committed by then cuts, which is the honest answer to a network that slow (REQ-UIX-127).
const SETTLE_AFTER_COMMIT_MS = 900;
const ABANDON_MS = 10_000;
let abandon: number | null = null;

// ── The poster handoff (REQ-UIX-122, REQ-UIX-127) ────────────────────────────────────────────────────────────
// The event page is dynamic, so its skeleton usually commits before the page: the jump would find no poster to land
// on. On a jump press the tapped card's poster is remembered here — its session, read from the link, and the image
// already decoded in the card, and where it stood — and the event's skeleton draws it and flies it from there
// (`poster-flight.ts`). Leaving the event by back remembers the hero's place, so the card flies home from it.
export interface HandedPoster {
  sessionId: string;
  src: string;
  /** The image's own ratio, so the skeleton reserves the box the hero will. */
  ratio: number;
  /** Where the card's poster stood when it was pressed. */
  from: Box | null;
}
let handed: HandedPoster | null = null;
const SESSION_HREF = /\/app\/sessions\/([0-9a-f-]{36})(?:[/?#]|$)/i;

export function handPoster(link: Element): void {
  const href = link.getAttribute("href") ?? "";
  const id = SESSION_HREF.exec(href)?.[1];
  const img = link.querySelector("img");
  handed =
    id && img && img.currentSrc && img.naturalWidth > 0
      ? { sessionId: id.toLowerCase(), src: img.currentSrc, ratio: img.naturalWidth / img.naturalHeight, from: boxOf(img) }
      : null;
}

/** Takes the poster handed for this session — once: a later visit by any other path draws the skeleton's box. */
export function takeHandedPoster(sessionId: string): HandedPoster | null {
  const poster = handedPoster(sessionId);
  if (poster) handed = null;
  return poster;
}

// The way back: the hero's place, remembered as the member leaves by history, for the card to fly home from.
let returning: { sessionId: string; from: Box } | null = null;
function rememberHero(): void {
  const hero = document.querySelector<HTMLElement>("[data-poster-hero]");
  const box = hero ? boxOf(hero) : null;
  returning = hero && box ? { sessionId: (hero.dataset.posterHero ?? "").toLowerCase(), from: box } : null;
}

/**
 * ★ Back has no view transition: Next restores the page it kept on a history move without one (measured,
 * `wave29-lead-moves`). So once the restored page commits it RISES from where a push left it — the mirror of the sink —
 * as a live animation on the page, `transform` and `filter` only, `--dur-slow` on `--ease-out` (REQ-UIX-124). The card
 * that was jumped from flies home beside it (`landReturningPoster`).
 */
export function riseOnBack(): Animation | null {
  if (typeof document === "undefined" || document.documentElement.dataset.nav !== "back") return null;
  if (isStillPath(location.pathname) || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const page = document.querySelector<HTMLElement>("#main > *");
  if (!page || typeof page.animate !== "function") return null;
  const root = getComputedStyle(document.documentElement);
  const duration = Number.parseFloat(root.getPropertyValue("--dur-slow")) || 0;
  if (duration === 0) return null;
  return page.animate(
    [
      { transform: "scale(0.94)", filter: "brightness(0.5) blur(6px)" },
      { transform: "none", filter: "none" },
    ],
    { duration, easing: root.getPropertyValue("--ease-out").trim() || "ease-out" },
  );
}

/** Called once the navigation has committed: a card whose event was just left by back flies home. */
export function landReturningPoster(): void {
  const r = returning;
  returning = null;
  if (!r) return;
  const img = [...document.querySelectorAll<HTMLImageElement>(`a[data-nav-kind="jump"][href$="/app/sessions/${r.sessionId}"] img`)].find(
    (el) => el.getClientRects().length > 0,
  );
  if (img) flyFrom(img, r.from, false);
}

/** The poster handed for this session, if the press that led here was a jump from its card. */
export function handedPoster(sessionId: string): HandedPoster | null {
  return handed && handed.sessionId === sessionId.toLowerCase() ? handed : null;
}

/** Sets the kind for the navigation about to happen. Inside the staff tree, or for `none`, it clears instead. */
export function setNavKind(kind: NavKind, pathname = typeof location === "undefined" ? "" : location.pathname): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (kind === "none" || isStillPath(pathname)) {
    delete root.dataset.nav;
    return;
  }
  root.dataset.nav = kind;
  if (abandon !== null) window.clearTimeout(abandon);
  abandon = window.setTimeout(clearNavKind, ABANDON_MS);
}

let tapped: HTMLElement | null = null;
function markTapped(el: HTMLElement): void {
  tapped?.removeAttribute("data-nav-tapped");
  tapped = el;
  el.setAttribute("data-nav-tapped", "");
}

export function clearNavKind(): void {
  if (typeof document === "undefined") return;
  delete document.documentElement.dataset.nav;
  tapped?.removeAttribute("data-nav-tapped");
  tapped = null;
  if (abandon !== null) window.clearTimeout(abandon);
  abandon = null;
}

/** Called by the shell once a navigation has committed: the move plays, then the kind is cleared. */
export function settleNavKind(): () => void {
  const timer = window.setTimeout(clearNavKind, SETTLE_AFTER_COMMIT_MS);
  return () => window.clearTimeout(timer);
}

/**
 * A tab's side relative to the current one, in tab order (REQ-UIX-125): a later tab is at the inline-end, so its
 * content arrives from there. The current tab asks for nothing; with no current tab the side is the inline-end.
 */
export function switchKind(index: number, currentIndex: number): LinkNavKind | undefined {
  if (index === currentIndex) return undefined;
  return currentIndex < 0 || index > currentIndex ? "switch-end" : "switch-start";
}

/** The kind a click asks for, or null — only a plain, same-tab, primary click on an element that declares one. */
export function kindOfClick(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented" | "target">): LinkNavKind | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-nav-kind]");
  if (el) {
    if (el instanceof HTMLAnchorElement && el.target && el.target !== "_self") return null;
    const kind = el.dataset.navKind;
    return isNavKind(kind) && kind !== "back" && kind !== "none" ? kind : null;
  }
  // ★ No declared kind: a link to a CHILD of this screen is a push (REQ-UIX-124) — حسابي → الإعدادات, the event → the
  // viewer · check-in · rating, the directory → a profile — so no call site has to remember to say so.
  const a = target.closest<HTMLAnchorElement>("a[href]");
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download") || typeof location === "undefined") return null;
  return isChildPath(location.pathname, new URL(a.href, location.href)) ? "push" : null;
}

/** A same-origin path strictly below the current one: `/ar/app/me` → `/ar/app/me/settings`. */
export function isChildPath(current: string, next: URL): boolean {
  if (typeof location !== "undefined" && next.origin !== location.origin) return false;
  const base = current.replace(/\/+$/, "");
  return next.pathname.startsWith(`${base}/`) && next.pathname.length > base.length + 1;
}

interface NavigationLike {
  currentEntry: { index: number } | null;
  addEventListener(type: "navigate", listener: (event: { navigationType: string; destination: { index: number } }) => void): void;
  removeEventListener(type: "navigate", listener: (event: { navigationType: string; destination: { index: number } }) => void): void;
}

/**
 * Listens once, for the whole app shell: presses on links that declare a kind, and history moves. Returns the
 * cleanup. The Navigation API tells back from forward; where it is missing, a history move is read as back — the
 * common case, and only ever a move, never a behaviour.
 */
export function installNavMotion(): () => void {
  const onClick = (event: MouseEvent) => {
    const kind = kindOfClick(event);
    if (!kind) return;
    setNavKind(kind);
    const link = (event.target as Element).closest<HTMLElement>("[data-nav-kind]");
    if (kind === "jump" && link) handPoster(link);
    // Only the TAPPED tab's icon jumps (REQ-UIX-125); the mark goes with the kind.
    if (kind.startsWith("switch") && link) markTapped(link);
  };
  document.addEventListener("click", onClick, true);

  const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (navigation && typeof navigation.addEventListener === "function") {
    const onNavigate = (event: { navigationType: string; destination: { index: number } }) => {
      if (event.navigationType !== "traverse") return;
      const from = navigation.currentEntry?.index ?? 0;
      const back = event.destination.index < from;
      if (back) rememberHero();
      setNavKind(back ? "back" : "push");
    };
    navigation.addEventListener("navigate", onNavigate);
    return () => {
      document.removeEventListener("click", onClick, true);
      navigation.removeEventListener("navigate", onNavigate);
    };
  }

  const onPop = () => {
    rememberHero();
    setNavKind("back");
  };
  window.addEventListener("popstate", onPop);
  return () => {
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("popstate", onPop);
  };
}
