import type { AvatarKey } from "@/lib/avatar-library";
import type { AvatarSheet, AvatarWriteResult } from "@/lib/dal/avatars";

// The sheet's data and writes — `platform`'s contract 3 (`docs/plan/notes/platform.md` W29.4, DEC-281). Types only:
// the sheet calls the writes through `me/actions.ts`'s Server Actions and never touches Storage.

/** `AvatarSheet`: what the ring shows and which controls apply. */
export type PictureSheetData = AvatarSheet;

/** What «حفظ» commits. A removal keeps the held key and declines Google (`removeAvatarPhoto`, DEC-281). */
export type PictureChoice = { kind: "library"; key: AvatarKey } | { kind: "remove" } | { kind: "google" };

/** `AvatarWriteResult`, as the Server Action returns it. */
export type PictureSaveResult = AvatarWriteResult;

/** The member the ring draws: the same three fields `<Avatar>` takes everywhere. */
export interface PictureMember {
  memberId: string;
  displayName: string | null;
  /** The company's team colour, or null for the neutral ring. */
  teamColor: string | null;
}
