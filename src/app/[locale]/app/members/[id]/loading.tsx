// The profile's skeleton — REQ-UIX-005, DEC-213 §5.113: under `[id]/`, so the directory's list skeleton at the
// segment root is not what a profile shows while it loads. No text, no `getTranslations`.
import { ProfileSkeleton } from "@/components/members/member-skeletons";

export default function Loading() {
  return <ProfileSkeleton />;
}
