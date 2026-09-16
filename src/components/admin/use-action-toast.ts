"use client";

import { useActionState } from "react";
import { useToast } from "@/components/ui/toast";
import type { ToastOptions } from "@/components/ui";

/**
 * `useActionState`, with the toast fired FROM THE ACTION'S RESULT.
 *
 * ★ Never from an effect keyed on the state. Wave 6 found the failure: when a
 * save removes the thing that rendered it — a resolved card leaving its queue,
 * a dialog closing on success — the refreshed tree and the action's return
 * land in one commit, React discards the unmounting fiber's pending update,
 * and an effect in it never runs. Called here, in the action's own body,
 * `toast.show()` is an ordinary call on `ToastProvider`, whatever happens to
 * the component that dispatched it. `moderation/reports/report-card.tsx`
 * wrote this by hand; every wave-8 console form uses this instead.
 */
// `S` is a plain state object — never a promise — which is what lets it stand
// for `useActionState`'s `Awaited<S>`.
export function useActionToast<S extends object>(
  action: (previous: S, formData: FormData) => Promise<S>,
  initialState: S,
  toastFor: (result: S) => ToastOptions | null,
): [state: S, dispatch: (formData: FormData) => void, pending: boolean] {
  const toast = useToast();
  return useActionState<S, FormData>(async (previous: S, formData: FormData) => {
    const result = await action(previous, formData);
    const options = toastFor(result);
    if (options) toast.show(options);
    return result;
  }, initialState as Awaited<S>) as [S, (formData: FormData) => void, boolean];
}
