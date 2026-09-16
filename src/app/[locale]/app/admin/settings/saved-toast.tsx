"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/components/ui/toast";

// Fires the `?saved=1` confirmation exactly once, then strips the query
// param — `admin/scoring`/`admin/emails`'s own `?saved=1` convention
// (neither rebuilt onto the system yet), given its first `ui/toast` caller.
// Without the strip, a refresh or a back-navigation would replay a stale
// "saved" toast for a page the member is only viewing, not just having
// saved. `router.replace` (not `push`), so this never adds a history entry
// of its own — the SAVE action's own redirect already did that.
export function SavedToast({ message }: { message: string }) {
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    toast.show({ title: message, tone: "success" });
    router.replace("/app/admin/settings", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires exactly once, on mount, regardless of whether `toast`/`router`/`message` are referentially stable.
  }, []);

  return null;
}
