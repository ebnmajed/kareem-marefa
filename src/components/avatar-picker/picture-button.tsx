"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { PictureSheet } from "./picture-sheet";
import { POLL_STEPS } from "./upload";
import type { PictureChoice, PictureMember, PictureSaveResult, PictureSheetData } from "./types";

// The way into «صورتك» (REQ-PRF-016, AVA-04; `m10c/Me.dc.html:26`, `MeEdit.dc.html:26`). The standing's picture,
// wrapped through `HubStanding`'s `picture` slot (DEC-281 §6): on ملفي's card, and on the hub band from `lg`.
//
// ★ NOTHING IS DRAWN ON IT in read mode; in «عدّل ملفك» (`?edit`, the card only) it carries the 26 px lime camera
// badge at the bottom inline-end. It is a BUTTON, not a link: the sheet needs script, and `profile-edit.tsx`'s leave
// guard catches anchors only, so opening the sheet in edit mode never asks «تجاهل التغييرات؟».
//
// Both forms of the standing are in the document at every width (`displayed-only.tsx`), so each button owns its own
// sheet; only the displayed one is in the accessibility tree.

function CameraGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export interface PictureButtonProps {
  sheet: PictureSheetData;
  member: PictureMember;
  /** The camera badge — ملفي's edit mode only (DEC-281 §6). */
  badge?: boolean;
  save: (choice: PictureChoice) => Promise<PictureSaveResult>;
  /** Re-reads the sheet's state — after «من Google», to learn when the copy lands. */
  read: () => Promise<PictureSheetData>;
  /** The standing's `<Avatar>`, unchanged. */
  children: ReactNode;
}

export function PictureButton({ sheet, member, badge = false, save, read, children }: PictureButtonProps) {
  const t = useTranslations("profile");
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const watching = useRef<AbortController | null>(null);

  useEffect(() => () => watching.current?.abort(), []);

  // ★ «من Google» commits at once but the copy lands later: the page rereads when `href` moves, within the same budget
  // as an upload's poll; past it, the next visit shows the copy.
  const watchGoogle = async (before: string | null) => {
    watching.current?.abort();
    const controller = new AbortController();
    watching.current = controller;
    for (const wait of POLL_STEPS) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (controller.signal.aborted) return;
      try {
        const now = await read();
        if (now.href !== before && now.source === "google") return router.refresh();
      } catch {
        return;
      }
    }
  };

  const onSaved = (kind: PictureChoice["kind"] | "upload") => {
    toast.show({ title: t("saved"), tone: "success" });
    router.refresh();
    if (kind === "google") void watchGoogle(sheet.href);
  };

  return (
    <>
      <button type="button" aria-label={t("picture.title")} aria-haspopup="dialog" onClick={() => setOpen(true)} className="relative inline-flex shrink-0 rounded-pill">
        {children}
        {badge ? (
          <span
            aria-hidden="true"
            data-slot="camera"
            className="absolute -end-1.5 -bottom-1.5 inline-flex size-[26px] items-center justify-center rounded-pill bg-accent text-on-accent shadow-[0_2px_0_var(--accent-deep,transparent),0_0_0_3px_var(--surface)]"
          >
            <CameraGlyph />
          </span>
        ) : null}
      </button>
      <PictureSheet open={open} onOpenChange={setOpen} sheet={sheet} member={member} save={save} onSaved={onSaved} />
    </>
  );
}
