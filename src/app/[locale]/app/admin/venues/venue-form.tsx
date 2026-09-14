"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { VenueState } from "./actions";
import { emptyVenueState } from "./state";

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";

export function VenueForm({ action }: { action: (prev: VenueState, formData: FormData) => Promise<VenueState> }) {
  const t = useTranslations("admin.venues");
  const [state, formAction, pending] = useActionState(action, emptyVenueState);

  return (
    <form action={formAction} className="mt-4 max-w-2xl space-y-5">
      {state.error ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(state.error)}
        </p>
      ) : null}
      <div>
        <label htmlFor="v-name" className="text-label text-fg-heading">
          {t("nameLabel")}
        </label>
        <input id="v-name" name="name" required maxLength={120} className={FIELD} />
      </div>
      <div>
        <label htmlFor="v-address" className="text-label text-fg-heading">
          {t("addressLabel")}
        </label>
        <input id="v-address" name="address" maxLength={300} className={FIELD} />
      </div>
      <div>
        <label htmlFor="v-map" className="text-label text-fg-heading">
          {t("mapLabel")}
        </label>
        {/* A URL types left to right whatever the page direction. */}
        <input id="v-map" name="mapUrl" type="url" dir="ltr" className={FIELD} />
      </div>
      <div>
        <label htmlFor="v-capacity" className="text-label text-fg-heading">
          {t("capacityLabel")}
        </label>
        <input id="v-capacity" name="capacity" type="number" inputMode="numeric" min={1} max={10000} dir="ltr" className={`${FIELD} w-32 text-center`} />
      </div>
      <div>
        <label htmlFor="v-tz" className="text-label text-fg-heading">
          {t("timeZoneLabel")}
        </label>
        <p className="mt-1 text-body-sm text-fg-muted">{t("timeZoneHint")}</p>
        <input id="v-tz" name="timeZone" dir="ltr" placeholder="Asia/Riyadh" maxLength={64} className={FIELD} />
      </div>
      <div>
        <label htmlFor="v-notes" className="text-label text-fg-heading">
          {t("notesLabel")}
        </label>
        <textarea id="v-notes" name="notes" rows={3} maxLength={2000} className={`${FIELD} min-h-24`} />
      </div>
      <Button type="submit" disabled={pending}>
        {t("add")}
      </Button>
    </form>
  );
}
