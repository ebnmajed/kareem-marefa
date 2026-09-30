import type { AttendeeStackProps } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";

// content's file — REQ-UIX-057, DEC-206 §4.56, §4.78, A33 rule 3.
// Overlapping faces, each in its company's ring, and how many in words.
//
// ★ IT DRAWS WHO IT IS GIVEN AND DECIDES NOTHING. A member may not see who else
// attends (`checkins_read`, `rsvps_read`: oneself, staff, presenters — `0010:508`),
// so the caller passes faces only for a viewer RLS already answers for, and for
// everyone else an empty list: the count line then stands alone, which is a whole
// state and not a degraded one.
//
// ★ Beside `AvatarStack` (§4.78) — both stand. `AvatarStack` draws no ring
// (DEC-186 §5), treats its overflow as an optional «+N», and is a bare span at its
// call sites; this one rings every face (`null` is the neutral ring, never «no
// ring»), always says the count as a sentence, and is a named group. Rewriting
// `AvatarStack` on top of this would change what its call sites render.
//
// Each face is decorative: the names are read once, as a list, by a screen reader,
// and the count is text. Faces overlap by a logical negative inline margin, never a
// physical one. Nothing scales on hover.

export function AttendeeStack({ people, max = 4, countLabel, label, size = 32, className = "" }: AttendeeStackProps) {
  const shown = people.slice(0, Math.max(0, max));
  const named = shown.filter((p) => Boolean(p.displayName));
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {shown.length > 0 ? (
        <span data-slot="faces" className="flex [&>*:not(:first-child)]:-ms-2">
          {shown.map((p) => (
            // The ground's own colour around each face separates the overlap, as the artboard draws it.
            <span key={p.memberId} className="rounded-pill ring-2 ring-canvas">
              <Avatar memberId={p.memberId} displayName={p.displayName} src={p.src} size={size} teamColor={p.teamColor ?? null} decorative />
            </span>
          ))}
        </span>
      ) : null}
      {named.length > 0 ? (
        <ul className="sr-only">
          {named.map((p) => (
            <li key={p.memberId}>
              <bdi>{p.displayName}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
      <span data-slot="count" className="text-caption text-fg-muted">
        <bdi>{countLabel}</bdi>
      </span>
    </div>
  );
}
