"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { subscribeToHostTopic } from "@/lib/realtime/channel";
import { formatNumber } from "@/components/sessions/numerals";
import { ClockIcon } from "@/components/ui/icons";

// The host view's clock and its live feed — SCR-016 (REQ-CHK-001, REQ-CHK-002, REQ-UIX-062, DEC-209).
//
// ★ «THE TIME UNTIL IT ROTATES» AND «THE COUNT UPDATES LIVE» (REQ-CHK-001, A18). Neither existed:
// the page had no client part, so the code on the wall and the count were a server read, stale until
// someone reloaded. Three things refresh the page's server tree now, and nothing else does:
//   · the instant the view next changes — the rotation, or the day's start when the code is not out
//     yet («يظهر رمز الحضور هنا تلقائيًا عند بدئها» is finally true) — one `router.refresh()`;
//   · a poke on the private `host:<session>` topic, which the database sends on every check-in and
//     every removal (`supabase/proposed/checkin/`), naming no member;
//   · the page becoming visible again after the phone slept.
// Pokes are COALESCED: at most one refresh in flight and one trailing, so forty arrivals in a minute
// are a handful of reads, not forty.
//
// ★ THE COUNTDOWN IS COUNTED AGAINST THE SERVER'S CLOCK: `readAt` is the instant of the read, so the
// remaining time is `rotatesAt − readAt` and elapses by `performance.now()` — a phone whose clock is
// wrong still shows the right minutes. A one-second tick changes TEXT only, never `aria-live` (it
// would speak every second). DEC-209: a display, not a nudge on a pending control (DEC-146 holds).
//
// ★ `variant="console"` (wave 21, DEC-228 §4.6, add-only): SCR-044's code card draws the same countdown as a bare
// `m:ss` — no icon, no grace, no sentence — and keeps every refresh above. The default is the host view's output,
// byte for byte. The console never animates: the number changes, nothing moves.

const TICK_MS = 1000;

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${formatNumber(minutes)}:${String(seconds).padStart(2, "0")}`;
}

const bold = (chunks: ReactNode) => <b className="font-bold text-fg-heading">{chunks}</b>;
const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

export function HostClock({
  sessionId,
  readAt,
  rotatesAt,
  nextChangeAt,
  graceSeconds,
  listen,
  variant = "host",
}: {
  sessionId: string;
  /** The server's instant of the read. */
  readAt: string;
  /** When the code on the wall stops being current; null when there is no code — then no countdown. */
  rotatesAt: string | null;
  /** The next instant the server's answer changes on its own (the rotation, the day's start), or null. */
  nextChangeAt: string | null;
  graceSeconds: number;
  /** Subscribe to the room's pokes — while the day can still take attendance. */
  listen: boolean;
  /** `"host"` (the default) is SCR-016's sentence; `"console"` is the bare time, for SCR-044's code card. */
  variant?: "host" | "console";
}) {
  const t = useTranslations("checkin.host.rotation");
  const router = useRouter();
  const [refreshing, start] = useTransition();
  const trailing = useRef(false);
  const read = Date.parse(readAt);
  const remainingAtRead = rotatesAt ? Date.parse(rotatesAt) - read : null;
  // What has elapsed since THIS read — a newer read starts again from zero without a reset.
  const [tick, setTick] = useState({ readAt, ms: 0 });
  const elapsed = tick.readAt === readAt ? tick.ms : 0;

  function refresh() {
    if (refreshing) {
      trailing.current = true;
      return;
    }
    start(() => router.refresh());
  }
  // The refresh that finished may have been asked for again meanwhile: once, now.
  useEffect(() => {
    if (!refreshing && trailing.current) {
      trailing.current = false;
      start(() => router.refresh());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  // The tick. Keyed on the read: a fresh read restarts the count from its own `readAt`.
  useEffect(() => {
    if (remainingAtRead === null) return;
    const origin = performance.now();
    const timer = window.setInterval(() => setTick({ readAt, ms: performance.now() - origin }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [readAt, remainingAtRead]);

  // The next change the server already knows about — one refresh, at that instant.
  useEffect(() => {
    if (!nextChangeAt) return;
    const wait = Date.parse(nextChangeAt) - read;
    const timer = window.setTimeout(() => start(() => router.refresh()), Math.max(0, wait));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextChangeAt, readAt]);

  // The room: every check-in and every removal on this session pokes the topic.
  useEffect(() => {
    if (!listen) return;
    return subscribeToHostTopic(sessionId, () => refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen, sessionId]);

  // A phone that slept missed rotations and pokes alike.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (remainingAtRead === null) return null;
  const remaining = remainingAtRead - elapsed;
  if (variant === "console") {
    return (
      <bdi className="tabular-nums" data-host-clock="">
        {clock(remaining)}
      </bdi>
    );
  }
  const graceMinutes = graceSeconds % 60 === 0 ? graceSeconds / 60 : null;
  const grace =
    graceMinutes !== null
      ? t.rich("graceMinutes", { count: graceMinutes, value: formatNumber(graceMinutes), bdi })
      : t.rich("graceSeconds", { count: graceSeconds, value: formatNumber(graceSeconds), bdi });

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 text-center text-body-sm text-fg-muted" data-host-clock="">
      <ClockIcon className="shrink-0" />
      <span>{remaining > 0 ? t.rich("in", { time: clock(remaining), b: (chunks) => bold(<bdi>{chunks}</bdi>) }) : t("now")}</span>
      <span aria-hidden="true">·</span>
      <span>{grace}</span>
    </p>
  );
}
