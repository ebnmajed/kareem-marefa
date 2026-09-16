"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Toast as RadixToast } from "radix-ui";
import type { ToastHandle, ToastOptions } from "@/components/ui";
import { AlertCircleIcon, CheckCircleIcon, CloseIcon, InfoIcon } from "@/components/ui/icons";

// The house toast — `16` §7.3, REQ-UIX-007.
//
// It replaces the pattern the product uses today: a `role="status"` paragraph
// rendered somewhere in the page, which the member may already have scrolled
// past. A toast is anchored to the viewport, so the acknowledgement arrives
// where the eye is rather than where the markup is.
//
// Radix for the swipe, the timer pause on hover and focus, the escape
// handling and the `aria-live` region's ordering (DEC-019). The house tokens
// for the look, and `Direction.Provider` in the locale layout for the swipe
// direction — nothing here knows about RTL.
//
// ★ ERRORS DO NOT AUTO-DISMISS. Five seconds is enough to confirm something
// worked and never enough to read why something failed, and a failure the
// member did not finish reading is a failure they will hit again. Success and
// info use `role="status"` (polite); failure uses `role="alert"` (assertive),
// because it interrupts a task rather than confirming one.
//
// ★ Bottom-centre on phone, bottom-start on desktop (`16` §7.3) — and it must
// clear the tab bar, which is why the viewport's padding reads the same
// `--tabbar-h` and safe-area inset the bar itself sets. A toast behind the tab
// bar is the two-fixed-bars problem in miniature.

const ToastContext = createContext<ToastHandle | null>(null);

/**
 * `useToast().show({...})` from any client component under the provider.
 * Outside one it is a no-op rather than a throw: a toast is an
 * acknowledgement, and losing one must never take a screen down with it.
 */
export function useToast(): ToastHandle {
  const handle = useContext(ToastContext);
  return handle ?? NO_OP;
}

const NO_OP: ToastHandle = { show: () => {} };

interface Live extends ToastOptions {
  id: number;
}

const tones = {
  success: { cls: "border-success text-success", Icon: CheckCircleIcon },
  error: { cls: "border-error-border text-error", Icon: AlertCircleIcon },
  info: { cls: "border-edge-strong text-fg-heading", Icon: InfoIcon },
} as const;

export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [live, setLive] = useState<Live[]>([]);
  const show = useCallback((options: ToastOptions) => {
    setLive((current) => [...current, { ...options, id: Date.now() + Math.random() }]);
  }, []);
  const handle = useMemo<ToastHandle>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={handle}>
      <RadixToast.Provider swipeDirection="down">
        {children}
        {live.map((toast) => {
          const tone = tones[toast.tone ?? "info"];
          const isError = toast.tone === "error";
          return (
            <RadixToast.Root
              key={toast.id}
              // Errors stay until dismissed; everything else clears at 5 s.
              duration={isError ? Number.POSITIVE_INFINITY : 5000}
              onOpenChange={(open) => {
                if (!open) setLive((current) => current.filter((t) => t.id !== toast.id));
              }}
              type={isError ? "foreground" : "background"}
              className={`pointer-events-auto flex w-full items-start gap-3 rounded-card border bg-canvas p-4 shadow-[var(--shadow-card)] ${tone.cls}`}
            >
              <tone.Icon aria-hidden className="mt-0.5 shrink-0 text-[1.25rem]" />
              <div className="min-w-0 flex-1">
                <RadixToast.Title className="text-label text-fg-heading">{toast.title}</RadixToast.Title>
                {toast.description ? (
                  <RadixToast.Description className="mt-1 text-body-sm text-fg-body">
                    {toast.description}
                  </RadixToast.Description>
                ) : null}
                {/* One action, never more: a toast that offers a choice is a
                    dialog that forgot to ask. */}
                {toast.action ? (
                  <RadixToast.Action asChild altText={toast.action.label}>
                    <button
                      type="button"
                      onClick={toast.action.onClick}
                      className="mt-2 text-label text-fg-heading underline underline-offset-4"
                    >
                      {toast.action.label}
                    </button>
                  </RadixToast.Action>
                ) : null}
              </div>
              <RadixToast.Close
                aria-label={closeLabel}
                className="shrink-0 rounded-field p-1 text-fg-muted hover:bg-silver-100 hover:text-fg-heading"
              >
                <CloseIcon aria-hidden />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport
          // ★ `empty:hidden` and `pointer-events-none` (DEC-111, DEC-133): an EMPTY
          // viewport was still a fixed, padded box ~112 px tall at z-40 — over the
          // z-30 tab bar, catching taps meant for its middle tabs. Hidden while
          // there is nothing to say; transparent to the pointer around a toast.
          className="pointer-events-none fixed start-0 end-0 bottom-0 z-40 mx-auto flex w-full max-w-sm flex-col gap-2 p-4 empty:hidden md:end-auto md:mx-0"
          // ★ Clears the tab bar, from the same token the bar pads itself with.
          style={{ paddingBlockEnd: "calc(1rem + var(--tabbar-h) + env(safe-area-inset-bottom, 0px))" }}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
