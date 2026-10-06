"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CameraIcon } from "@/components/ui/icons";
import { CaptureFlow } from "@/components/stories/capture-flow";

// «أضف إلى القصة» on the event page (REQ-STO-011, the owner's ruling of 2026-10-06, DEC-269). The viewer's «أضف» needs
// a story to open, and a live session has none until its first generated frame — so the page carries its own door to
// the same capture. Drawn only when `story_capture_open()` answered yes for this viewer (the page asks); every capture
// route re-derives that gate, so this button is a hint, never the rule.
export function AddToStory({ sessionId }: { sessionId: string }) {
  const t = useTranslations("stories.capture");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="md" className="gap-2" onClick={() => setOpen(true)}>
        <CameraIcon aria-hidden />
        {t("dialog")}
      </Button>
      {open ? (
        <CaptureFlow
          sessionId={sessionId}
          onClose={() => {
            setOpen(false);
            // A posted frame shows as «processing» in the story and the album: read them again.
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
