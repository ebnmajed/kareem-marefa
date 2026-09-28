import { ProgressBar } from "@/components/ui/progress-bar";

// The gallery's `progress-bar` demo — contract 4 (DEC-183 §5, DEC-186 §5,
// REQ-UIX-036). Every state, from literal fixtures: no DAL, no session. The lead
// renders it inside the playground's scope. Static: nothing moves this wave.

const RACE = [
  { company: "صنف", color: "#FF9A2E", value: 1410, share: 1 },
  { company: "مواهب", color: "#35D0FF", value: 1180, share: 0.84 },
  { company: "أيك", color: "#9B7CFF", value: 640, share: 0.45 },
] as const;

export function ProgressBarDemo() {
  return (
    <div data-demo="progress-bar" className="flex max-w-md flex-col gap-5">
      {/* A level: named, with its value in text. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-fg-muted">
          مستواك · <bdi>320 من 500</bdi>
        </span>
        <ProgressBar value={320} max={500} label="مستواك" valueText="320 من 500" />
      </div>

      {/* Every fill, and the empty and full ends. */}
      <ProgressBar value={0} label="لم يبدأ" valueText="0 من 100" />
      <ProgressBar value={60} label="الإشارة" fill="signal" valueText="60 من 100" />
      <ProgressBar value={100} label="مكتمل" fill="text" valueText="100 من 100" />

      {/* A company's race: decorative, because the value is already in the text beside it. */}
      <ul className="flex flex-col gap-2">
        {RACE.map((row) => (
          <li key={row.company} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-caption text-fg-body">
            <bdi>{row.company}</bdi>
            <ProgressBar value={row.share} max={1} decorative fill="team" teamColor={row.color} />
            <bdi className="font-medium">{row.value.toLocaleString("en-US")}</bdi>
          </li>
        ))}
        <li className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-caption text-fg-body">
          <span>شركة بلا لون</span>
          <ProgressBar value={0.2} max={1} decorative fill="team" teamColor={null} />
          <bdi className="font-medium">280</bdi>
        </li>
      </ul>

      {/* A story's segments: 3 px, the current one part-way. */}
      <div className="flex gap-1">
        <ProgressBar value={1} max={1} size="sm" fill="text" label="الإطار 1 من 4" />
        <ProgressBar value={1} max={1} size="sm" fill="text" label="الإطار 2 من 4" />
        <ProgressBar value={0.4} max={1} size="sm" fill="text" label="الإطار 3 من 4" />
        <ProgressBar value={0} max={1} size="sm" fill="text" label="الإطار 4 من 4" />
      </div>
    </div>
  );
}
