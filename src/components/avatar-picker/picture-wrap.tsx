import "server-only";

import type { ReactNode } from "react";
import { savePicture, readPicture } from "@/app/[locale]/app/me/actions";
import type { PictureWrap } from "@/components/hub/standing";
import { getAvatarSheet } from "@/lib/dal/avatars";
import { getMe, listCompanies } from "@/lib/dal/members";
import type { Locale } from "@/i18n/routing";
import { PictureButton } from "./picture-button";

// `HubStanding`'s `picture` slot, filled (DEC-281 §6, `content`'s R1/R2): the standing's avatar becomes the way into
// «صورتك». ملفي's page passes it to the card — with the camera badge in «عدّل ملفك» — and the hub's layout to the band
// from `lg`, on every hub page, without the badge. One reader for both, so the two cannot drift.
//
// ★ The Server Actions reach the client BOUND to the locale (DEC-159): never an inline closure across the boundary.

export async function pictureWrap(locale: string, { badge = false }: { badge?: boolean } = {}): Promise<PictureWrap> {
  const [me, sheet, companies] = await Promise.all([getMe(locale), getAvatarSheet(locale), listCompanies(locale)]);
  const teamColor = companies.find((c) => c.id === me.companyId)?.teamColor ?? null;
  const member = { memberId: me.id, displayName: me.displayName, teamColor };
  const save = savePicture.bind(null, locale as Locale);
  const read = readPicture.bind(null, locale as Locale);
  return function wrapPicture(avatar: ReactNode) {
    return (
      <PictureButton sheet={sheet} member={member} badge={badge} save={save} read={read}>
        {avatar}
      </PictureButton>
    );
  };
}
