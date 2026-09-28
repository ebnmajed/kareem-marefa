"use client";

import type { ReactionBarItem } from "@/components/ui";
import { ReactionBar } from "@/components/ui/reaction-bar";
import { BoltIcon, FlameIcon, HeartIcon, StarIcon } from "@/components/ui/icons";

// The gallery's `reaction-bar` demo — contract 4 (DEC-183 §5, DEC-186 §4 – §5,
// REQ-UIX-034). Every state, from literal fixtures: none pressed, some pressed,
// zero counts, a large count, pending and read-only. The set is the demo's own —
// the primitive names none. Nothing pops: the acknowledgement is the pressed
// state. A client module only because `onToggle` is a function.

function set(pressed: string[], counts: Record<string, number>): ReactionBarItem[] {
  const on = (kind: string) => pressed.includes(kind);
  return [
    { kind: "like", label: "إعجاب", count: counts.like ?? 0, pressed: on("like"), icon: <HeartIcon filled={on("like")} /> },
    { kind: "fire", label: "نار", count: counts.fire ?? 0, pressed: on("fire"), icon: <FlameIcon filled={on("fire")} /> },
    { kind: "star", label: "نجمة", count: counts.star ?? 0, pressed: on("star"), icon: <StarIcon filled={on("star")} /> },
    { kind: "bolt", label: "برق", count: counts.bolt ?? 0, pressed: on("bolt"), icon: <BoltIcon filled={on("bolt")} /> },
  ];
}

const noop = () => {};

export function ReactionBarDemo() {
  return (
    <div data-demo="reaction-bar" className="flex flex-col gap-4">
      <ReactionBar label="التفاعلات — لا شيء مضغوط" items={set([], { like: 12, fire: 3, bolt: 7 })} onToggle={noop} />
      <ReactionBar label="التفاعلات — إعجاب ونار" items={set(["like", "fire"], { like: 13, fire: 4, bolt: 7 })} onToggle={noop} />
      <ReactionBar label="التفاعلات — بلا عدد" items={set([], {})} onToggle={noop} />
      <ReactionBar label="التفاعلات — عدد كبير" items={set(["bolt"], { like: 1250, fire: 98, star: 41, bolt: 12480 })} onToggle={noop} />
      <ReactionBar label="التفاعلات — قيد الإرسال" items={set(["star"], { like: 12, star: 1 })} onToggle={noop} pending />
      <ReactionBar label="التفاعلات — للقراءة فقط" items={set([], { like: 12, fire: 3 })} readOnly />
    </div>
  );
}
