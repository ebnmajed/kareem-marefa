"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createBrowserClient } from "@/lib/supabase/browser";
import type { StopState } from "./actions";

// THE stop control — the only one in the product (wave 8, notes W8.0 F1). The
// banner renders it, and so does SCR-085's active panel; a second, plainer stop
// on that page is what once ended the row and left the org on the token.
//
// A client component for one reason: ending the session removes the org from
// the NEXT token, and the current one is valid for up to `jwt_expiry` (900 s).
// So after the action it refreshes the session — an AUTH operation, which is
// exactly what the browser client is for (DEC-020) — and only then re-renders,
// so the server sees the new cookie.
//
// ★ The refresh runs whatever the action answered: a session the job has
// already expired must leave the token too. And it runs inside the transition's
// callback, never in an effect — this control unmounts the moment the banner
// disappears, and an unmounted component's effect never runs (F2).
//
// Pending keeps the label and adds the spinner (REQ-UIX-007). No timer, no
// nudge (DEC-146).

export function StopImpersonationControl({
  sessionId,
  stop,
  className = "",
}: {
  sessionId: string;
  stop: (sessionId: string) => Promise<StopState>;
  /** Layout only — the banner makes it full width on a phone. */
  className?: string;
}) {
  const t = useTranslations("platform.banner");
  const tErr = useTranslations("platform.errors");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className={className}
      pending={pending}
      onClick={() =>
        start(async () => {
          const result = await stop(sessionId);
          try {
            await createBrowserClient().auth.refreshSession();
          } finally {
            router.refresh();
          }
          toast.show(result.error ? { title: tErr(result.error), tone: "error" } : { title: t("stopped"), tone: "success" });
        })
      }
    >
      {t("stop")}
    </Button>
  );
}
