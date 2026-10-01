// The directory's skeleton — REQ-UIX-005, DEC-213 §5.113. The segment root's loading state is the LIST's shape;
// the profile has its own under `[id]/`. No text, no `getTranslations`.
import { DirectorySkeleton } from "@/components/members/member-skeletons";

export default function Loading() {
  return <DirectorySkeleton />;
}
