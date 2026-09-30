"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleSessionLike } from "@/components/feed/actions";
import { HeartIcon } from "@/components/ui/icons";
import { ReactionBar } from "@/components/ui/reaction-bar";

// The post's like — `ui/reaction-bar` with one kind (DEC-206 §4.51: the second kind waits for the house set).
// Optimistic, as `event/comment-item.tsx` is: the pressed state shows at once and the server's answer settles
// it; a refused write puts it back. Nothing animates — the acknowledgement is the pressed state (REQ-UIX-034).
// `readOnly` (a cancelled session) shows the count and offers nothing.

interface LikeState {
  liked: boolean;
  count: number;
}

export function LikeButton({
  locale,
  sessionId,
  liked,
  count,
  groupLabel,
  likeLabel,
  readOnly,
}: {
  locale: string;
  sessionId: string;
  liked: boolean;
  count: number;
  groupLabel: string;
  likeLabel: string;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // The settled state is kept here, not in the props: the feed is not re-read after a like, so an optimistic
  // value that fell back to the props would undo the member's own press.
  const [settled, setSettled] = useState<LikeState>({ liked, count });
  const [state, flip] = useOptimistic<LikeState, void>(settled, (s) => ({ liked: !s.liked, count: Math.max(0, s.count + (s.liked ? -1 : 1)) }));

  function toggle() {
    startTransition(async () => {
      flip();
      const result = await toggleSessionLike(locale, sessionId);
      if (!result.ok) return;
      startTransition(() =>
        setSettled((s) => (s.liked === result.liked ? s : { liked: result.liked, count: Math.max(0, s.count + (result.liked ? 1 : -1)) })),
      );
    });
  }

  return (
    <ReactionBar
      label={groupLabel}
      readOnly={readOnly}
      pending={pending}
      onToggle={toggle}
      items={[{ kind: "like", label: likeLabel, count: state.count, pressed: state.liked, icon: <HeartIcon filled={state.liked} className="text-base" /> }]}
    />
  );
}
