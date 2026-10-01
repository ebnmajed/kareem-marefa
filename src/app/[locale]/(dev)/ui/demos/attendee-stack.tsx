import { AttendeeStack } from "@/components/ui/attendee-stack";

// The gallery's `attendee-stack` demo — REQ-UIX-057, DEC-206 §4.56. Every state, in Arabic, from literal fixtures:
// the count alone (what a plain member sees — A33 rule 3), one face, four, more than `max`, a company with no colour.

const PEOPLE = [
  { memberId: "demo-a", displayName: "سارة القحطاني", teamColor: "#35D0FF" },
  { memberId: "demo-b", displayName: "نورة العتيبي", teamColor: "#FF9A2E" },
  { memberId: "demo-c", displayName: "فهد العنزي", teamColor: "#9B7CFF" },
  { memberId: "demo-d", displayName: "محمد الدوسري", teamColor: "#3BE8B0" },
  { memberId: "demo-e", displayName: "ريم الشمري", teamColor: "#FF4FB8" },
  { memberId: "demo-f", displayName: "خالد العمري", teamColor: null },
];

export function AttendeeStackDemo() {
  return (
    <div data-demo="attendee-stack" className="flex flex-col gap-4">
      <AttendeeStack label="من يحضر" people={[]} countLabel="23 من 40 حاضرًا الآن" />
      <AttendeeStack label="من يحضر" people={PEOPLE.slice(0, 1)} countLabel="محجوز واحد" />
      <AttendeeStack label="من يحضر" people={PEOPLE.slice(0, 3)} max={3} size={24} countLabel="3 محجوزين" />
      <AttendeeStack label="من يحضر" people={PEOPLE.slice(0, 4)} countLabel="12 محجوزًا" />
      <AttendeeStack label="من يحضر" people={PEOPLE} countLabel="40 محجوزًا" />
      <AttendeeStack label="من يحضر" people={PEOPLE.slice(5)} countLabel="محجوز واحد، شركته بلا لون" />
    </div>
  );
}
