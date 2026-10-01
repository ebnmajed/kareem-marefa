import type { ReactNode } from "react";
import { SubmissionsProvider } from "@/components/checkin/submissions";

// SCR-014's route layout — one job (DEC-212): to hold what this client has submitted across the refused page's
// remount. A refusal is the action's redirect to `?error=…`, and the page segment is keyed by its search params, so
// the page is a new mount after every refusal; this layout is not, and it unmounts when the member leaves the route.
// It renders no markup of its own and reads nothing: the session gate and every read stay the page's.
export default function CheckInLayout({ children }: { children: ReactNode }) {
  return <SubmissionsProvider>{children}</SubmissionsProvider>;
}
