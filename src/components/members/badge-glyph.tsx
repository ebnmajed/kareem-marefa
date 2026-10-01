import { CalendarIcon, ChartIcon, CheckCircleIcon, StarIcon, UsersIcon } from "@/components/ui/icons";
import type { BadgeGlyph as Glyph } from "@/components/members/badge-look";

/** The house glyph for a badge's look — decorative; the medallion hides it from assistive technology. */
export function BadgeGlyph({ glyph }: { glyph: Glyph }) {
  switch (glyph) {
    case "check":
      return <CheckCircleIcon />;
    case "users":
      return <UsersIcon />;
    case "calendar":
      return <CalendarIcon />;
    case "chart":
      return <ChartIcon />;
    default:
      return <StarIcon filled />;
  }
}
