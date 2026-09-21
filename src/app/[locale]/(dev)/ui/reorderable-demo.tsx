"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { ReorderableList } from "@/components/ui/reorderable-list";

// The gallery's one client island. `ReorderableList` takes functions as props,
// so a Server Component cannot hold it (`DEC-159`'s crash); the three lists
// that use it — a survey's questions, a choice question's options, an email's
// blocks — each hold it inside their own client editor, exactly like this.
//
// Literals only, like the rest of the gallery: it has to be deterministic
// enough to diff.

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

export function ReorderableDemo() {
  const [items, setItems] = useState(QUESTIONS);
  return (
    <ReorderableList
      className="w-full max-w-xl"
      items={items}
      getKey={(q) => q.id}
      getName={(q) => q.text}
      label="أسئلة الاستبانة"
      onReorder={(next) => setItems(next.map((id) => items.find((q) => q.id === id)!))}
      renderItem={(q) => (
        <Panel className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-body text-fg-heading">
            <bdi>{q.text}</bdi>
          </span>
          <Badge size="sm" outline>
            {q.kind}
          </Badge>
        </Panel>
      )}
    />
  );
}
