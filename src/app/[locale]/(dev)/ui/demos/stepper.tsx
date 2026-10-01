import type { StepperStep } from "@/components/ui";
import { Stepper } from "@/components/ui/stepper";

// `stepper`'s gallery entry — REQ-UIX-064, contract 2 (DEC-213, DEC-214).
//
// Literals only: no DAL, no session, no catalogue. Every position a proposal can stand at on `SCR-018`, both
// current tones, the four-step line (DEC-214: «طُلب تعديل» is a step only while it is the state), and a short
// line. It carries NO scope of its own: `playground.tsx` renders it on each ground.

const LABEL = "مراحل المقترح";
const DONE = "مكتملة";

function line(labels: string[], current: number): StepperStep[] {
  return labels.map((label, i) => ({ id: String(i), label, status: i < current ? "done" : i === current ? "current" : "upcoming" }));
}

const FIVE = ["أُرسل", "قيد المراجعة", "طُلب تعديل", "معتمد", "مُجدوَل"];
const FOUR = ["أُرسل", "قيد المراجعة", "معتمد", "مُجدوَل"];

const STATES: Array<{ title: string; steps: StepperStep[]; tone?: "signal" | "accent" }> = [
  { title: "أُرسل", steps: line(FOUR, 0), tone: "accent" },
  { title: "قيد المراجعة", steps: line(FOUR, 1), tone: "accent" },
  { title: "طُلب تعديل — كما في اللوحة", steps: line(FIVE, 2) },
  { title: "معتمد", steps: line(FOUR, 2), tone: "accent" },
  { title: "مُجدوَل", steps: line(FOUR, 3), tone: "accent" },
  { title: "اكتمل كل شيء", steps: line(FOUR, 4) },
  { title: "ثلاث خطوات", steps: line(["اكتب", "راجِع", "أرسِل"], 1) },
];

export function StepperDemo() {
  return (
    <div data-demo="stepper" className="flex max-w-sm flex-col gap-6">
      {STATES.map((s) => (
        <figure key={s.title} className="flex flex-col gap-2">
          <figcaption className="text-caption text-fg-muted">{s.title}</figcaption>
          <Stepper label={LABEL} doneLabel={DONE} steps={s.steps} currentTone={s.tone} />
        </figure>
      ))}
    </div>
  );
}
