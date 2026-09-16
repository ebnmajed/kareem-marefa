"use client";

import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { ShareIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

// «شارك» — the event page's share affordance (the owner's decision of
// 2026-09-15).
//
// ★ IT SHARES THE PUBLIC CARD'S URL, NOT THIS PAGE'S. The event page is a
// member's page: pasted into a group chat it previews as the sign-in screen,
// and opened by a non-member it stays the sign-in screen. `/{locale}/s/{id}`
// is the link that was built to be shared — the same session, six public
// fields, a preview image. What the recipient will see is said by the card's
// caption before the press (`hintId`), and again in the toast after it.
//
// Wave 6 (DEC-130): one button, as the canvas draws it, instead of a button,
// a hint and the URL printed under it. The phone's own share sheet where there
// is one; the clipboard otherwise. ★ A REFUSED CLIPBOARD IS NOT A DEAD BUTTON:
// `navigator.clipboard` needs a secure context and a permission a phone browser
// can refuse, so that failure raises a toast carrying the URL itself — as a
// bidi-isolated run, so an Arabic sentence does not reorder its slashes — and
// the toast stays until dismissed.

const LRI = "⁦";
const PDI = "⁩";

export interface ShareLinkProps {
  url: string;
  /** The session's title, for the share sheet. */
  title: string;
  label: string;
  copiedLabel: string;
  hint: string;
  failedLabel: string;
  /** `button` in the action card; `icon` in the phone's action bar. */
  variant?: "button" | "icon";
  /** The caption that says, before the press, what the recipient will see. */
  hintId?: string;
}

export function ShareLink({ url, title, label, copiedLabel, hint, failedLabel, variant = "button", hintId }: ShareLinkProps) {
  const toast = useToast();

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title });
        return;
      } catch (error) {
        // The member closed the sheet: that is an answer, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ title: copiedLabel, description: hint, tone: "success" });
    } catch {
      toast.show({ title: failedLabel, description: `${LRI}${url}${PDI}`, tone: "error" });
    }
  }

  if (variant === "icon") {
    return (
      <IconButton label={label} variant="secondary" onClick={share} aria-describedby={hintId}>
        <ShareIcon />
      </IconButton>
    );
  }
  return (
    <Button type="button" variant="secondary" size="md" onClick={share} iconStart={<ShareIcon />} aria-describedby={hintId}>
      {label}
    </Button>
  );
}
