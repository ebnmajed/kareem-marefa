"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { EVENT_TYPES, type EventType } from "@/components/sessions/event-type";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toast";
import { saveEventType } from "./actions";

// «نوع الفعالية» on الجدولة's edit mode — REQ-SES-022.
//
// ★ ITS OWN SAVE, as the certificate mode's control has (DEC-256): `set_event_type()` is the one writer, and the
// schedule form's save never sends the type. No `<form>`, and the button is `type="button"`, so inside the schedule
// form it submits nothing; the radios' `eventType` name is not a key `saveSchedule()` reads.

export function EventTypeControl({ locale, sessionId, eventType }: { locale: Locale; sessionId: string; eventType: EventType }) {
  const t = useTranslations("schedule.eventType");
  const tType = useTranslations("sessions.eventType");
  const toast = useToast();
  const [saved, setSaved] = useState<EventType>(eventType);
  const [value, setValue] = useState<EventType>(eventType);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await saveEventType(locale, sessionId, value);
      if (result.ok) {
        setSaved(value);
        toast.show({ tone: "success", title: t("saved") });
      } else {
        toast.show({ tone: "error", title: t("failed") });
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        name="eventType"
        appearance="chips"
        // The row's own label already names it on screen; the group still carries its name for assistive technology.
        legend={<span className="sr-only">{tType("label")}</span>}
        value={value}
        onChange={(next) => setValue(next as EventType)}
        options={EVENT_TYPES.map((type) => ({ value: type, label: tType(type) }))}
      />
      <Button type="button" variant="secondary" size="md" className="self-start" pending={pending} disabled={value === saved} onClick={save}>
        {t("save")}
      </Button>
    </div>
  );
}
