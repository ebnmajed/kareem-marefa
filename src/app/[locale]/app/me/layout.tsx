import { Suspense, type ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { HubStanding, HubStandingSkeleton } from "@/components/hub/standing";
import { HubStrip } from "@/components/shell/hub-strip";
import { pictureWrap } from "@/components/avatar-picker/picture-wrap";

// The `/app/me` hub's frame — `REQ-UIX-070`, `STORY-UIX-059`, `HubDesktop.dc.html`; rebuilt in wave 20 (`DEC-208`).
//
// From `lg`: the standing band (contract 3, `scoring`'s) and the strip under a rule, then the page. Below `lg` this
// renders nothing: the page draws its own top row and the phone strip (`HubTopRow`, `HubStrip`), because the strip
// sits under the page's title there and above it here. No game rail — the band is the member's own standing, and a
// rail beside it would repeat it (`DEC-216` §5.8).
//
// ★ NO AUTH AND NO DATA GATE HERE (`CLAUDE.md`, «Data access» §3). A layout does not re-render on navigation; every
// check stays in each page's DAL call, and the band reads its own data at `requireSession()`.
export default async function MeLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <Suspense fallback={<HubStandingSkeleton form="band" className="mb-4 hidden lg:block" />}>
        <BandStanding locale={locale} />
      </Suspense>
      <div className="mb-6 hidden lg:block">
        <HubStrip desktop />
      </div>
      {children}
    </>
  );
}

/**
 * ★ Wave 29 (DEC-281 §6, `content`'s R2): on desktop the band's picture is the way into «صورتك» from every hub page —
 * without the camera badge, which is ملفي's edit mode alone. Inside the band's own Suspense, so the layout awaits
 * nothing of its own.
 */
async function BandStanding({ locale }: { locale: string }) {
  return <HubStanding locale={locale} form="band" className="mb-4 hidden lg:block" picture={await pictureWrap(locale)} />;
}
