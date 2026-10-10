import { boxOf, type Box } from "./poster-flight";

// Navigation motion — which move a navigation plays (DEC-280 §5 – §6, as simplified by DEC-285).
//
// ★ ONE MOVE PER TAP, CARRIED AS THE TRANSITION'S OWN TYPE. A link names its move — `jump`, `push`, `switch-start`,
// `switch-end` — in `data-nav-kind` (`ui/link`'s `nav`, the tab bar, the rail). The tap stores it; the view transition
// whose update CHANGES THE PATH takes it as its type (`types`, read by `:active-view-transition-type()` in
// `globals.css`) and the store empties at that moment. Nothing is timed and nothing is page-wide, so a move cannot
// play twice or leak into the next tap.
// ★ Why not Next's own `transitionTypes`: Next attaches it only to the click's transition, and a server-rendered page
// commits in a LATER one when its data arrives — measured, the types arrived empty. Taking the kind at the transition's
// start is what reaches the commit that actually shows the page.
//
// Everything else — the real page replacing its skeleton, a section streaming in, a save refreshing the page — carries
// no type and crossfades briefly. Back is instant: Next restores a page without a view transition (measured), and the
// state machine that faked one was the source of overlapping moves (DEC-285).
//
// This module keeps only what the types cannot carry: whether a path is the console's, which side a tab is on, and the
// poster handed from a tapped card to the event page it opens.

export type LinkNavKind = "jump" | "push" | "switch-start" | "switch-end";

const STILL = /^\/(?:[a-z]{2}\/)?app\/(?:admin|platform)(?:\/|$)/;

/** The console and the platform never move (REQ-UIX-129). Locale-prefixed or not. */
export function isStillPath(pathname: string): boolean {
  return STILL.test(pathname);
}

/**
 * A tab's side relative to the current one, in tab order (REQ-UIX-125): a later tab is at the inline-end, so its
 * content arrives from there. The current tab asks for nothing; with no current tab the side is the inline-end.
 */
export function switchKind(index: number, currentIndex: number): LinkNavKind | undefined {
  if (index === currentIndex) return undefined;
  return currentIndex < 0 || index > currentIndex ? "switch-end" : "switch-start";
}

// ── The poster handoff (REQ-UIX-122, REQ-UIX-127) ────────────────────────────────────────────────────────────
// A jump flies the tapped card's poster into the event page (`poster-flight.ts`). On press, the card's poster — its
// session, read from the link, the decoded image, and where it stood — is remembered here; the event's skeleton or its
// hero, whichever lands first, takes it once and flies it from there.
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

/** The poster handed for this session, if the press that led here was a jump from its card. */
export function handedPoster(sessionId: string): HandedPoster | null {
  return handed && handed.sessionId === sessionId.toLowerCase() ? handed : null;
}

/** Takes the poster handed for this session — once: a later visit by any other path draws the skeleton's box. */
export function takeHandedPoster(sessionId: string): HandedPoster | null {
  const poster = handedPoster(sessionId);
  if (poster) handed = null;
  return poster;
}

// ── The tap's move ────────────────────────────────────────────────────────────────────────────────────────
const KINDS: readonly string[] = ["jump", "push", "switch-start", "switch-end"];
let pending: LinkNavKind | null = null;

/** The move a tap stored and no transition has taken yet. */
export function pendingKind(): LinkNavKind | null {
  return pending;
}

/** The navigation committed: whatever the tap stored was taken or is moot now. */
export function forgetPendingKind(): void {
  pending = null;
}

/** The kind a plain, same-tab, primary click on a link asks for, or null. */
export function kindOfClick(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented" | "target">): LinkNavKind | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-nav-kind]");
  if (!el || (el instanceof HTMLAnchorElement && el.target && el.target !== "_self")) return null;
  const kind = el.dataset.navKind ?? "";
  return KINDS.includes(kind) ? (kind as LinkNavKind) : null;
}

type StartViewTransition = (arg?: unknown) => ViewTransition;
type Update = () => unknown;

// Bumped by the shell's layout effect when the path changes — React runs layout effects INSIDE a view transition's
// update step, while Next pushes the URL only after it (measured), so this is the signal that a transition is the
// navigation itself.
let navigations = 0;
export function noteNavigation(): void {
  navigations += 1;
}

/**
 * Starts a view transition and gives it the stored move as its type — but only if this transition is the NAVIGATION:
 * the path changed during its update. ★ A tap first updates the page being LEFT (the link's pending dot), and that is
 * a transition too; measured, it took the move and the new page arrived with none. The type is added right after the
 * update step (`types` is mutable until the animations start), synchronously, and the store empties then.
 */
export function startWithMove(original: (arg?: unknown) => ViewTransition, arg?: unknown): ViewTransition {
  const kind = pending;
  if (!kind) return original(arg);
  let started: ViewTransition | null = null;
  const take = (before: number) => {
    if (pending === kind && navigations !== before) {
      pending = null;
      (started as (ViewTransition & { types?: Set<string> }) | null)?.types?.add(kind);
    }
  };
  const wrap = (update: Update | undefined): Update => () => {
    const before = navigations;
    const result = update?.();
    take(before);
    // A blocked update (fonts, images) resolves later: its layout effects run then — check again when it does.
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then((value) => {
        take(before);
        return value;
      });
    }
    return result;
  };
  const next =
    typeof arg === "function"
      ? wrap(arg as Update)
      : arg && typeof arg === "object"
        ? { ...(arg as object), update: wrap((arg as { update?: Update }).update) }
        : arg;
  started = original(next);
  return started;
}

/**
 * Installs the one mechanism, once, for the whole shell. Returns the cleanup. A tap on a link that names a move stores
 * it (outside the console) and, for a jump, hands its poster; `document.startViewTransition` is wrapped so the first
 * transition after the tap carries the move as its type.
 */
export function installNavMotion(): () => void {
  const onClick = (event: MouseEvent) => {
    if (isStillPath(location.pathname)) return;
    const kind = kindOfClick(event);
    if (!kind) return;
    pending = kind;
    const link = (event.target as Element).closest('[data-nav-kind="jump"]');
    if (kind === "jump" && link) handPoster(link);
  };
  document.addEventListener("click", onClick, true);

  const doc = document as Document & { startViewTransition?: StartViewTransition };
  const original = doc.startViewTransition;
  if (typeof original === "function") {
    const bound = (a?: unknown) => original.call(document, a);
    doc.startViewTransition = ((arg?: unknown) => startWithMove(bound, arg)) as StartViewTransition;
  }
  return () => {
    document.removeEventListener("click", onClick, true);
    if (typeof original === "function") doc.startViewTransition = original;
    pending = null;
  };
}
