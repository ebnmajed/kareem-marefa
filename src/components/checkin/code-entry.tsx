"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CodeInputProps } from "@/components/ui";
import { useSubmissions } from "@/components/checkin/moment-check-in";
import { CodeInput } from "@/components/ui/code-input";

// SCR-014's code, and the mistyped code's shake — DEC-212 (the owner's ruling on DEC-206 §4.75), REQ-UIX-046 as
// amended, `M10a.md` §8: «wrong code — boxes shake once (input feedback; reduced motion: border coral + message)».
//
// ★ ONLY A MISTYPED CODE, AND ONLY THE BOXES. The page passes the refusal it rendered; only `invalid_code` shakes. A
// rate limit, a closed door, an ended session, a conflict or any error is the system refusing, and does not move
// (wave 16's rule stands for them). The class lands on the six boxes' group alone — never the label or the alert.
//
// ★ ONCE PER REFUSED SUBMISSION, FROM THIS CLIENT. The cue is a submission this client made (`useSubmissions()`)
// that the form has finished answering (`useFormStatus()` no longer pending) — never a render. A re-render changes
// neither; a reload, a back navigation or another phone mounts with nothing submitted, so a refused page loaded that
// way shows the coral border and the sentence, still. A second wrong code is a second submission and shakes again.
//
// ★ THE MOTION IS THE LEAD'S (`globals.css`, 8d362089): `.code-shake` — transform only, a token's duration, no
// scale — carries its animation only under `prefers-reduced-motion: no-preference`, so under reduced motion the
// class is inert and the static state is the whole state. Nothing here sets a duration or a keyframe.

export function CodeEntry({ refusal, ...props }: CodeInputProps & { refusal: string | null }) {
  const submissions = useSubmissions();
  const { pending } = useFormStatus();
  // The last submission this instance has answered; a fresh mount answers nothing.
  const answered = useRef(submissions);
  const [shaking, setShaking] = useState(false);

  // The latest refusal on the page, read a frame after the form is done: the refused page's props may trail the
  // form's status by a render, and deciding on the earlier props would answer the wrong refusal.
  const latest = useRef(refusal);
  useEffect(() => {
    latest.current = refusal;
  });

  // The frames in flight — cancelled on unmount only, so a later render cannot swallow an answer already given.
  const frames = useRef<number[]>([]);
  useEffect(() => () => frames.current.forEach(cancelAnimationFrame), []);

  useEffect(() => {
    if (pending || submissions === answered.current) return;
    frames.current.push(
      requestAnimationFrame(() => {
        // Answered once a refusal is on the page; a later render with one runs this again.
        if (submissions === answered.current || latest.current === null) return;
        answered.current = submissions;
        if (latest.current !== "invalid_code") return;
        // Off for a frame, then on: a second refusal restarts the animation on the same element.
        setShaking(false);
        frames.current.push(requestAnimationFrame(() => setShaking(true)));
      }),
    );
  }, [pending, submissions, refusal]);

  return (
    <div onAnimationEnd={(event) => event.animationName === "code-shake" && setShaking(false)} data-shaking={shaking || undefined}>
      <CodeInput {...props} boxesClassName={shaking ? "code-shake" : undefined} />
    </div>
  );
}
