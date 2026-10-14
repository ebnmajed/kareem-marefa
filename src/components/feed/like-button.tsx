"use client";

import { useRef, useState } from "react";
import { HeartIcon } from "@/components/ui/icons";
import { ReactionBar } from "@/components/ui/reaction-bar";
import { useToast } from "@/components/ui/toast";
import { isPending, queueReaction } from "@/lib/reactions/queue";

// The post's like — `ui/reaction-bar` with one kind (DEC-206 §4.51: the second kind waits for the house set).
// `readOnly` (a cancelled session) shows the count and offers nothing.
//
// ★ DEC-291, as DEC-290 made the comment's: THE LIKE IS THIS BUTTON'S STATE. A tap changes it at once and queues the
// DESIRED state (`lib/reactions/queue.ts` → `POST /api/reactions`, a Route Handler that never waits behind a Server
// Action); quick taps send one write. Nothing refreshes the page and nothing falls back to the props mid-write — the
// `useOptimistic` it replaced dropped the press when its transition ended, so the count could step back. A failed
// write puts back what the server held and says so. A tap that LIKES plays the reaction whisper once
// (`.reaction-ignite` + `.reaction-ring`, REQ-EVT-004 — it earns nothing), keyed so a re-render never replays it.

interface LikeState {
  liked: boolean;
  count: number;
}

export function LikeButton({
  sessionId,
  liked,
  count,
  groupLabel,
  likeLabel,
  failedLabel,
  readOnly,
}: {
  /** Kept for the callers' shape; the write needs none. */
  locale?: string;
  sessionId: string;
  liked: boolean;
  count: number;
  groupLabel: string;
  likeLabel: string;
  /** «تعذّر تسجيل إعجابك» — said when the write fails and the press is put back. */
  failedLabel?: string;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState<LikeState>({ liked, count });
  // A later paint's props are taken — unless this member's write is still on its way, since that paint may predate
  // the tap (React's «adjust during render», no effect).
  const [props, setProps] = useState<LikeState>({ liked, count });
  if (props.liked !== liked || props.count !== count) {
    setProps({ liked, count });
    if (!isPending("session", sessionId)) setState({ liked, count });
  }
  // What the server held before the first of a run of taps — put back if the write fails.
  const baseline = useRef<LikeState | null>(null);
  // Bumped by a tap that likes: the key that plays the whisper once.
  const [burst, setBurst] = useState(0);

  function toggle() {
    const next = !state.liked;
    if (!baseline.current) baseline.current = state;
    setState({ liked: next, count: Math.max(0, state.count + (next ? 1 : -1)) });
    if (next) setBurst((b) => b + 1);
    queueReaction({ target: "session", id: sessionId, kind: "like", on: next }, (result) => {
      const held = baseline.current;
      baseline.current = null;
      if (result.ok || !held) return;
      setState(held);
      if (failedLabel) toast.show({ tone: "error", title: failedLabel });
    });
  }

  return (
    <ReactionBar
      label={groupLabel}
      readOnly={readOnly}
      onToggle={toggle}
      items={[
        {
          kind: "like",
          label: likeLabel,
          count: state.count,
          pressed: state.liked,
          icon: (
            <span key={burst} className={`relative inline-flex ${burst > 0 && state.liked ? "reaction-ignite" : ""}`}>
              <HeartIcon filled={state.liked} className="text-base" />
              {burst > 0 && state.liked ? <span aria-hidden className="reaction-ring pointer-events-none absolute inset-0 rounded-full border-2 border-current" /> : null}
            </span>
          ),
        },
      ]}
    />
  );
}
