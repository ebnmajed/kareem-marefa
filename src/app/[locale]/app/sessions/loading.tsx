// The timeline's skeleton on `/app/sessions` — REQ-UIX-005. The same shape as
// `/app`'s, because the two routes render one component (DEC-130). No text and
// no `getTranslations`: it renders before `setRequestLocale`.
import { TimelineSkeleton } from "@/components/browse/timeline-skeleton";

export default function Loading() {
  return <TimelineSkeleton />;
}
