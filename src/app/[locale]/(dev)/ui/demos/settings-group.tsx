"use client";

import type { ReactNode } from "react";
import type { SettingsSwitchState } from "@/components/ui";
import { SettingsGroup } from "@/components/ui/settings-group";

// `settings-group`'s gallery entry — REQ-UIX-081, DEC-216 §2.1, DEC-218 §2, contract 2.
//
// Literals only: no DAL, no session, no catalogue. The switches save to nothing — one answers yes, one always
// refuses, so the reverted state and the reason beside it can be seen by flipping it. A titled group, an untitled one
// (`029` passes `showTitle={false}`), link rows with and without a value, and `025`'s action rows. It carries NO
// scope of its own: the gallery renders it on each of the scope's grounds.

async function saves(_previous: SettingsSwitchState, formData: FormData): Promise<SettingsSwitchState> {
  return { checked: formData.get("enabled") === "on", failed: false };
}

async function refuses(previous: SettingsSwitchState): Promise<SettingsSwitchState> {
  return { checked: previous.checked, failed: true };
}

function State({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-caption text-fg-muted">{title}</figcaption>
      {children}
    </figure>
  );
}

const quiet = "text-label font-bold text-fg-muted";

export function SettingsGroupDemo() {
  // `data-demo` is the handle a gallery spec captures by.
  return (
    <div data-demo="settings-group" className="flex max-w-md flex-col gap-8">
      <State title="مفاتيح تحفظ عند التغيير — والثالث يرفض الحفظ فيعود ويقول ذلك">
        <SettingsGroup
          title="البريد"
          rows={[
            { kind: "switch", id: "reminders", label: "التذكيرات", checked: true, action: saves, errorLabel: "تعذّر حفظ التفضيل. حاول مرة أخرى.", saveLabel: "حفظ" },
            { kind: "switch", id: "social", label: "التعليقات والإشارات", checked: false, action: saves, errorLabel: "تعذّر حفظ التفضيل. حاول مرة أخرى.", saveLabel: "حفظ" },
            { kind: "switch", id: "visible", label: "الظهور في لوحات الصدارة", checked: true, action: refuses, errorLabel: "تعذّر حفظ التفضيل. حاول مرة أخرى.", saveLabel: "حفظ" },
          ]}
        />
      </State>

      <State title="روابط، بلا عنوان مرسوم">
        <SettingsGroup
          title="روابط الحساب"
          showTitle={false}
          rows={[
            { kind: "link", id: "calendar", label: "تقويم Google", value: "متصل", href: "/app/me/calendar" },
            { kind: "link", id: "privacy", label: "البيانات والخصوصية", href: "/app/me/privacy" },
          ]}
        />
      </State>

      <State title="صفوف بعنصر تحكّم من الشاشة — الاتصال، وما لم يُضف">
        <SettingsGroup
          title="الاتصال"
          showTitle={false}
          rows={[{ kind: "action", id: "google", label: "تقويم Google", value: "متصل", control: <button type="button" className={quiet}>افصل</button> }]}
        />
        <SettingsGroup
          title="لم تُضف"
          rows={[
            { kind: "action", id: "s1", label: "العرض في 5 شرائح", detail: "اليوم 6:30 م", control: <button type="button" className="min-h-11 rounded-pill border border-edge bg-raised px-3.5 text-label font-bold text-fg-heading">أعد المحاولة</button> },
            { kind: "action", id: "s2", label: "ورشة البيانات المفتوحة", detail: "اليوم 2 · الأحد 4:00 م", control: <button type="button" className="min-h-11 rounded-pill border border-edge bg-raised px-3.5 text-label font-bold text-fg-heading">أعد المحاولة</button> },
          ]}
        />
      </State>
    </div>
  );
}
