"use client";

// SCR-029's route error boundary — REQ-UIX-016, REQ-UIX-077. A client component by Next's contract, so it reads no
// DAL: `RouteBoundary` renders the shared `<RouteError>` — one sentence, a retry wired to `reset()`, a way back.
import { RouteBoundary } from "@/components/shell/route-boundary";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteBoundary error={error} reset={reset} />;
}
