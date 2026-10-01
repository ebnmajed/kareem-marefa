"use client";

import { ActionBar } from "@/components/ui/action-bar";
import { ButtonLink } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkIcon, ShareIcon } from "@/components/ui/icons";
import { SessionCta } from "@/components/ui/session-cta";

// The gallery's `action-bar` demo — REQ-UIX-057, contract 2 of wave 18. Every
// arrangement the three event artboards draw — reserve, check in and rate — and
// the ones they do not: a primary alone, a note under the row, a label that wraps.
// `position="static"` so each sits in the page instead of all six stacking at the
// viewport's bottom. In Arabic, from literal fixtures; the lead renders it inside
// the scope.
//
// A client island because `SessionCta`'s action is a function; here it answers
// nothing, which is the pending state a press leaves the control in.

const nothing = async () => {};

function Save() {
  return (
    <IconButton label="احفظ الجلسة" variant="secondary">
      <BookmarkIcon />
    </IconButton>
  );
}

function Share() {
  return (
    <IconButton label="شارك الجلسة" variant="secondary">
      <ShareIcon />
    </IconButton>
  );
}

export function ActionBarDemo() {
  return (
    <div data-demo="action-bar" className="flex max-w-sm flex-col gap-6">
      <ActionBar
        position="static"
        label="إجراءات الجلسة"
        primary={<SessionCta state={{ kind: "reserve", act: { action: nothing } }} label="احجز مقعدك" />}
        secondary={[<Save key="save" />, <Share key="share" />]}
      />
      <ActionBar
        position="static"
        label="إجراءات الجلسة"
        primary={<SessionCta state={{ kind: "checkIn", act: { href: "/app/sessions/demo/check-in" } }} label="سجّل حضورك" />}
        secondary={[<Save key="save" />, <Share key="share" />]}
      />
      <ActionBar
        position="static"
        label="إجراءات الجلسة"
        primary={<SessionCta state={{ kind: "reserve", act: { href: "/app/sessions/demo/rate" } }} label="قيّم الجلسة" />}
        secondary={[
          <ButtonLink key="cert" href="/app/me/certificates" variant="secondary" size="md">
            شهادتك
          </ButtonLink>,
        ]}
      />
      <ActionBar position="static" label="إجراءات الجلسة" primary={<SessionCta state={{ kind: "reserve", act: { action: nothing } }} label="احجز مقعدك" />} />
      <ActionBar
        position="static"
        label="تسجيل الحضور"
        primary={<SessionCta state={{ kind: "checkIn", act: { action: nothing } }} label="سجّل حضوري" />}
        note={<span>لم تلتقط الرمز؟ اسأل المُقدِّم أن يعرضه مرة أخرى.</span>}
      />
      <ActionBar
        position="static"
        label="إجراءات الجلسة"
        primary={<SessionCta state={{ kind: "waitlist", act: { action: nothing } }} label="انضمّ إلى قائمة الانتظار لهذه الورشة الطويلة" />}
        secondary={[<Save key="save" />]}
      />
    </div>
  );
}
