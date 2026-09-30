"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Projection and the screen kept awake — SCR-016 (REQ-UIX-062, REQ-CHK-001; `Host.dc.html`; DEC-209 D4).
//
// ★ PROJECTION IS A STATE OF THE SAME PAGE, NOT A SECOND COPY OF THE CODE. The root carries
// `data-projecting`, and the page's own regions hide themselves under it (`group-data-[projecting]`)
// while the code grows to the viewport. One code element, so every spec that reads «the first
// `p[dir=ltr]`» reads the same six characters in either state, and a rotation's `router.refresh()`
// keeps the state and the fullscreen element — the root is never re-keyed.
// Fullscreen where the browser has element fullscreen; iPhone Safari does not, and gets the in-page
// layout alone. Escape, the browser leaving fullscreen, or the one quiet control end it.
//
// ★ AWAKE WHILE LIVE, PROJECTING OR NOT (DEC-209 D4): the Screen Wake Lock API, asked for while the
// day is taking attendance and the page is visible — the browser drops the lock when the page is
// hidden, so it is asked for again on return — and released on leaving live and on unmount.
// Unsupported or refused (battery saver, a policy): no lock, and ★ the sentence that promises a lit
// screen is NOT rendered, so the screen never claims what it does not do. No looping-video hack.
//
// ★ Without JavaScript the toggle does not exist — a control that does nothing is worse than none.

type Projection = { projecting: boolean; toggle: () => void; awake: boolean };
const ProjectionContext = createContext<Projection>({ projecting: false, toggle: () => {}, awake: false });

const noSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener?: (type: "release", cb: () => void) => void };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

export function ProjectionRoot({ live, className = "", children }: { live: boolean; className?: string; children: ReactNode }) {
  const [projecting, setProjecting] = useState(false);
  const [awake, setAwake] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  function toggle() {
    const node = root.current;
    if (!projecting) {
      setProjecting(true);
      if (node && typeof node.requestFullscreen === "function") node.requestFullscreen().catch(() => {});
    } else {
      setProjecting(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }

  // Leaving fullscreen by the browser's own means, or Escape, ends projection.
  useEffect(() => {
    if (!projecting) return;
    const onFullscreen = () => {
      if (!document.fullscreenElement) setProjecting(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjecting(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("keydown", onKey);
    };
  }, [projecting]);

  // The wake lock, while live.
  useEffect(() => {
    if (!live) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let active = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await wakeLock.request("screen");
        if (!active) {
          void next.release();
          return;
        }
        sentinel = next;
        setAwake(true);
        next.addEventListener?.("release", () => {
          if (sentinel === next) setAwake(false);
        });
      } catch {
        setAwake(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      const held = sentinel;
      sentinel = null;
      setAwake(false);
      if (held) void held.release().catch(() => {});
    };
  }, [live]);

  return (
    <ProjectionContext.Provider value={{ projecting, toggle, awake }}>
      <div
        ref={root}
        data-projecting={projecting || undefined}
        className={`group/project data-[projecting]:fixed data-[projecting]:inset-0 data-[projecting]:z-50 data-[projecting]:flex data-[projecting]:max-w-none data-[projecting]:flex-col data-[projecting]:items-center data-[projecting]:justify-center data-[projecting]:bg-canvas ${className}`}
      >
        {children}
      </div>
    </ProjectionContext.Provider>
  );
}

/** «اعرض على الشاشة» — a pressed toggle, present once hydrated. It stays visible, quiet, while projecting. */
export function ProjectionToggle() {
  const t = useTranslations("checkin.host.project");
  const { projecting, toggle } = useContext(ProjectionContext);
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return (
    <Button
      type="button"
      variant="quiet"
      size="sm"
      aria-pressed={projecting}
      onClick={toggle}
      className="shrink-0 group-data-[projecting]/project:absolute group-data-[projecting]/project:end-4 group-data-[projecting]/project:top-4"
    >
      {projecting ? t("stop") : t("start")}
    </Button>
  );
}

/** «تبقى الشاشة مضاءة أثناء الجلسة» — only while a lock is actually held. */
export function AwakeNote({ children }: { children: ReactNode }) {
  const { awake } = useContext(ProjectionContext);
  return awake ? <> {children}</> : null;
}

/** In projection with no lock held, the honest line under the code. */
export function DimNote({ children }: { children: ReactNode }) {
  const { projecting, awake } = useContext(ProjectionContext);
  return projecting && !awake ? <p className="mt-6 text-center text-body-sm text-fg-muted">{children}</p> : null;
}
