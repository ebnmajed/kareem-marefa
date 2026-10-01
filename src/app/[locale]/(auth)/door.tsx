import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { PlayWordmark } from "@/components/brand/wordmark";

// The door's frame — what `SCR-002`, `SCR-003` and `SCR-004` share in their
// artboards (`docs/design/screens/m10a/{Main,ChooseOrg,NoAccess}.dc.html`,
// REQ-UIX-058): the wordmark above, one panel, and a quiet row of links pinned to
// the foot of the screen. The layout gives the column; each screen says how big
// its wordmark stands and which links its foot carries.
//
// ★ NO ORG IS NAMED HERE. `Main.dc.html` writes «من شبه الجزيرة» under the mark;
// this door does not know the org — it is resolved from the address after Google
// answers — and `SCR-004` «names no org» (`09` §3, DEC-206 §4.37).

/** The wordmark. Outside the platform it leads to the public site (REQ-UIX-027). */
export function DoorLockup({ size, label }: { size: "lg" | "md"; label: string }) {
  return (
    <div className={`flex justify-center ${size === "lg" ? "pt-[72px]" : "pt-12"}`}>
      <Link
        href="/"
        aria-label={label}
        className="inline-flex text-accent focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"
      >
        <PlayWordmark height={size === "lg" ? 62 : 48} label={null} />
      </Link>
    </div>
  );
}

/** The links at the foot. `mt-auto` pins them to the bottom of a short screen. */
export function DoorFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-wrap items-center justify-center gap-x-[18px] gap-y-2 pt-8 text-[0.8125rem] text-fg-muted">{children}</div>;
}

export const doorLink = "inline-flex min-h-11 items-center underline-offset-4 hover:text-fg-heading hover:underline";
