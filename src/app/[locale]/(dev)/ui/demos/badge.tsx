import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { SESSION_PHASES, type SeatState } from "@/lib/session-status";

// The gallery's `badge` demo — contract 4 (DEC-183 §5, DEC-186 §3). Every state,
// from literal fixtures: no DAL, no session. The lead renders it inside the
// playground's scope. The words and colours are `DEC-073`'s on every surface;
// inside a dark scope each tone wears the on-dark form it already had.

const SEATS: SeatState[] = ["available", "full", "closed"];

export function BadgeDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {SESSION_PHASES.map((phase) => (
          <SessionStatusBadge key={phase} phase={phase} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SEATS.map((seat) => (
          <SessionStatusBadge key={seat} phase="open" seat={seat} />
        ))}
        <SessionStatusBadge phase="open" seat="available" closingSoon />
        <SessionStatusBadge phase="live" size="sm" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">معلومة</Badge>
        <Badge tone="success">نجاح</Badge>
        <Badge tone="live">جارٍ</Badge>
        <Badge tone="ended">انتهى</Badge>
        <Badge tone="error">خطأ</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge outline>مسودة</Badge>
        <Badge tone="info" outline>
          معلومة
        </Badge>
        <Badge tone="success" outline>
          نجاح
        </Badge>
        <Badge tone="live" outline>
          جارٍ
        </Badge>
        <Badge tone="ended" outline>
          انتهى
        </Badge>
        <Badge tone="error" outline>
          خطأ
        </Badge>
      </div>
      <div className="max-w-48">
        <Badge tone="ended" size="sm">
          مخفية — بانتظار المراجعة من فريق الإشراف
        </Badge>
      </div>
    </div>
  );
}
