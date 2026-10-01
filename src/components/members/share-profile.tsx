"use client";

import { IconButton } from "@/components/ui/icon-button";
import { ShareIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

// The profile's share — DEC-213 §5.118, DEC-214 §3 N5: the phone's top row only, as drawn. The native share sheet
// where there is one, a copied link otherwise. The link is the members-only page itself, so sharing it shows a
// colleague nothing new. A failure says so and does not animate.
export function ShareProfile({ label, title, copied, failed }: { label: string; title: string; copied: string; failed: string }) {
  const toast = useToast();
  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ title: copied, tone: "success" });
    } catch {
      toast.show({ title: failed, tone: "error" });
    }
  }
  return (
    <IconButton label={label} variant="secondary" size="sm" onClick={share}>
      <ShareIcon />
    </IconButton>
  );
}
