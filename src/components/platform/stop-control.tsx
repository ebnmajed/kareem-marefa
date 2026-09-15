"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createBrowserClient } from "@/lib/supabase/browser";

// The banner's stop control — a client component for one reason: ending the
// session removes the org from the NEXT token, and the current one is valid
// for up to `jwt_expiry` (900 s). Without the refresh below an operator would
// press "end" and keep the access for a quarter of an hour, which is the one
// thing `REQ-ADM-002` says must not happen quietly.
//
// The refresh is an AUTH operation, which is exactly what the browser client
// is for (DEC-020); no data is read or written here.
export function StopImpersonationControl({ sessionId, stop }: { sessionId: string; stop: (id: string) => Promise<void> }) {
  const t = useTranslations("platform.banner");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await stop(sessionId);
          // A failure here leaves the session ended and the token stale until
          // it expires on its own — recoverable, and never the other way round.
          try {
            await createBrowserClient().auth.refreshSession();
          } finally {
            router.refresh();
          }
        })
      }
      className="inline-flex h-10 shrink-0 items-center rounded-field border border-edge-strong px-4 text-label text-fg-heading hover:bg-silver-100 disabled:opacity-45"
    >
      {t("stop")}
    </button>
  );
}
