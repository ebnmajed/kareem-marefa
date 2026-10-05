"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// SCR-057 — leaving with unsaved changes asks (REQ-DSG-036, STORY-DSG-019, DEC-258 §2.2, DEC-259 §1.3).
//
// The house rule (`profile-edit.tsx`): a press on any link while something is unsaved opens a dialog; a reload or a
// closed tab gets the browser's own question. ★ `beforeunload` cannot carry our words — Chrome and Safari ignore a
// custom message and the event fires only after an interaction. A browser limit; nobody attempts a custom dialog there.
// ★ The browser's Back is not intercepted: the App Router has no supported veto, and a `popstate` trap breaks the Back
// it guards. The local draft answers Back — the editor's unmount writes it (`draft.ts`).
//
// ★ A CAPTURE-PHASE LISTENER ON `document`, as the profile's, because the links that leave are rendered by the SERVER
// page (the back link in `barStart`, the scheme links in `barEnd`), not by the editor: capture runs before React's root
// listener and so before `<Link>`'s own click. Three exclusions, each measured at sync 1:
//   · `/api/*` — the export panel's downloads are plain links with no `download` attribute; a download leaves nothing.
//   · the same pathname — the scheme links (`?scheme=`) re-render the same document, and Next keys a page segment's
//     state without its search params, so the editor stays mounted with the unsaved document on screen.
//   · modified clicks, middle clicks, `_blank` and `download` — a new tab loses nothing.
// ★ And one exit that is not a link: the certificate's other orientation is a `<form>` whose Server Action redirects
// to another document. The page marks it `data-designer-leaves`, and its submit is caught too.

export const LEAVES_ATTRIBUTE = "data-designer-leaves";

export type LeaveTarget = { kind: "href"; href: string; from: HTMLElement } | { kind: "form"; form: HTMLFormElement; from: HTMLElement | null };

export function leaveTargetOf(event: MouseEvent, location: Location = window.location): LeaveTarget | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return null;
  if (url.pathname.startsWith("/api/")) return null;
  if (url.pathname === location.pathname) return null;
  return { kind: "href", href: url.pathname + url.search + url.hash, from: anchor };
}

export interface LeaveGuard {
  /** Where the person was going, while the dialog asks. */
  target: LeaveTarget | null;
  /** «ابقَ». */
  stay: () => void;
  /** Disarm and go on — after a save that landed, or a confirmed discard. */
  proceed: (navigate: (href: string) => void) => void;
}

export function useLeaveGuard(armed: boolean): LeaveGuard {
  const [target, setTarget] = useState<LeaveTarget | null>(null);
  /** Set once the person has answered «leave»: nothing asks again on the way out. */
  const released = useRef(false);

  useEffect(() => {
    if (!armed) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (released.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (released.current) return;
      const next = leaveTargetOf(event);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(next);
    };
    const onSubmit = (event: SubmitEvent) => {
      if (released.current) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute(LEAVES_ATTRIBUTE)) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget({ kind: "form", form, from: event.submitter instanceof HTMLElement ? event.submitter : null });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [armed]);

  const stay = useCallback(() => setTarget(null), []);

  const proceed = useCallback(
    (navigate: (href: string) => void) => {
      const next = target;
      if (!next) return;
      released.current = true;
      setTarget(null);
      if (next.kind === "href") navigate(next.href);
      else next.form.requestSubmit();
    },
    [target],
  );

  return { target, stay, proceed };
}
