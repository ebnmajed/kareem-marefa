"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { TrashIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { ReorderableList } from "@/components/ui/reorderable-list";

// The gallery's `reorderable-list` demo — wave 17, contract 3 (DEC-199 §3).
// A client island: its props are functions, so a Server Component cannot hold
// it (DEC-159). Order by taps alone (DEC-093) — no drag, and no animation
// (`04-components.md`). Five lists: the side column at both sizes, the row's own
// actions, the controls handed inline to a card-shaped item, every control
// inert, and a list of one, whose two arrows have nowhere to go.
//
// Each list keeps its own order, so a press in one moves nothing in another,
// and each ground is its own render: the ids come from `useId`.

interface DemoQuestion {
  id: string;
  text: string;
  kind: string;
}

const QUESTIONS: DemoQuestion[] = [
  { id: "q1", text: "ما مدى وضوح المحتوى؟", kind: "مقياس 1–5" },
  { id: "q2", text: "هل كانت مدة الجلسة مناسبة؟", kind: "اختيار واحد" },
  { id: "q3", text: "ماذا تقترح للجلسة القادمة؟", kind: "نص حر" },
];

function Row({ question }: { question: DemoQuestion }) {
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-body text-fg-heading">
        <bdi>{question.text}</bdi>
      </span>
      <Badge size="sm" outline>
        {question.kind}
      </Badge>
    </Panel>
  );
}

function useOrder(initial: DemoQuestion[]) {
  const [items, setItems] = useState(initial);
  const onReorder = (next: string[]) => setItems(next.map((id) => items.find((q) => q.id === id)!));
  return { items, onReorder };
}

const shared = {
  className: "w-full max-w-xl",
  getKey: (q: DemoQuestion) => q.id,
  getName: (q: DemoQuestion) => q.text,
};

export function ReorderableListDemo() {
  const side = useOrder(QUESTIONS);
  const dense = useOrder(QUESTIONS);
  const actions = useOrder(QUESTIONS);
  const inline = useOrder(QUESTIONS);

  return (
    <div data-demo="reorderable-list" className="flex flex-col gap-8">
      <div data-state="side">
        <ReorderableList {...shared} {...side} label="أسئلة الاستبانة" renderItem={(q) => <Row question={q} />} />
      </div>

      <div data-state="sm">
        <ReorderableList {...shared} {...dense} size="sm" label="أسئلة الاستبانة، بحجم مضغوط" renderItem={(q) => <Row question={q} />} />
      </div>

      <div data-state="actions">
        <ReorderableList
          {...shared}
          {...actions}
          label="أسئلة الاستبانة، مع الحذف"
          renderItem={(q) => <Row question={q} />}
          renderActions={(q) => (
            <IconButton label={`احذف: ${q.text}`}>
              <TrashIcon />
            </IconButton>
          )}
        />
      </div>

      <div data-state="inline">
        <ReorderableList
          {...shared}
          {...inline}
          controls="inline"
          label="أسئلة الاستبانة، كبطاقات"
          renderItem={(q, { index, controls }) => (
            <Panel className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                {controls}
                <Badge size="sm" outline>
                  {`السؤال ${index + 1}`}
                </Badge>
              </div>
              <p className="text-body text-fg-heading">
                <bdi>{q.text}</bdi>
              </p>
              <p className="text-caption text-fg-muted">{q.kind}</p>
            </Panel>
          )}
        />
      </div>

      <div data-state="disabled">
        <ReorderableList {...shared} items={QUESTIONS} onReorder={() => undefined} disabled label="أسئلة الاستبانة، أثناء الحفظ" renderItem={(q) => <Row question={q} />} />
      </div>

      <div data-state="one">
        <ReorderableList {...shared} items={QUESTIONS.slice(0, 1)} onReorder={() => undefined} label="استبانة من سؤال واحد" renderItem={(q) => <Row question={q} />} />
      </div>
    </div>
  );
}
