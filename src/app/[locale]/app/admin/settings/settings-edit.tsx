"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter as useRawRouter } from "next/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import { ActionBar } from "@/components/ui/action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { KvCard } from "@/components/ui/kv-card";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import type { OrgSettingsView } from "@/lib/dal/admin-settings";
import { summaryErrors } from "@/lib/form-state";
import { FORM_FIELDS, parseDomains } from "./fields";
import { controlId, emptySettingsState, type SettingsState } from "./state";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-063 in edit mode — `REQ-UIX-091`, `M10c.md` §1, `DEC-231` §3, `DEC-232` §3 and §5.1. The four `kv-card`s of read
// mode, `mode="edit"` (`sessions'` primitive, composed as it is: one `<fieldset>` per row, no `<form>` — the page owns
// it). `profile-edit.tsx` is the reference, read and never imported.
//
// ★ EDIT MODE NAMES ITS STATE: «تعديل الإعدادات», the count of unsaved changes, each changed field outlined in the accent
// AND «(معدّل)» in its accessible name — never colour alone (SC 1.4.1).
// ★ NOTHING IS WRITTEN BEFORE «احفظ», and then only what changed (the action diffs against `opened`).
// ★ THE SAVED MARK IS THE SERVER'S RECEIPT: «حُفظ» only when the save wrote records, «لم يتغيّر شيء» when it wrote none;
// then back to read mode, whose mark is read from those records. A refusal keeps edit mode, the error at its field.
// ★ «احفظ» is enabled in the server's HTML (a save pressed before hydration still posts); hydrated, it waits for a change.
// ★ LEAVING WITH CHANGES ASKS — but an in-page anchor (the error summary's link to a field) leaves nothing.
// ★ Two rows are the deployment's, not the org's — Google Calendar and the verify link — and stay read in edit mode.

export interface DerivedValues {
  calendar: string;
  verify: string;
}

type Values = Record<(typeof FORM_FIELDS)[number], string>;

const asText = (v: string | number | boolean | null): string => (typeof v === "boolean" ? (v ? "on" : "") : v === null ? "" : String(v));

// The card's title is a heading for a screen reader and a small section label to the eye (the lead's ruling at the
// artboard review): `kv-card` draws it at h2 scale, which competed with the page's h1, so it is set at label scale
// from here — the primitive itself is composed as it is.
const CARD = "[&_h2]:text-label [&_h2]:font-bold [&_h2]:text-fg-muted";

export function SettingsEdit({
  action,
  view,
  derived,
  timeZones,
}: {
  action: (previous: SettingsState, formData: FormData) => Promise<SettingsState>;
  view: OrgSettingsView;
  derived: DerivedValues;
  timeZones: string[];
}) {
  const t = useTranslations("settings.admin");
  const tDialog = useTranslations("ui.dialog");
  const toast = useToast();
  const router = useRouter();
  const rawRouter = useRawRouter();
  const hydrated = useHydrated();

  const initial = Object.fromEntries(FORM_FIELDS.map((f) => [f, asText(view[f])])) as Values;
  const [values, setValues] = useState<Values>(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const set = (field: keyof Values) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  // The period to return to when «لا يتغيّر» is switched back off: the one the page opened with, else the default.
  const [lastRotation, setLastRotation] = useState(initial.checkInRotationSeconds === "" ? "600" : initial.checkInRotationSeconds);

  // The toast and the way back are called FROM the action's own result (`use-action-toast.ts` says why).
  const [state, formAction] = useActionState<SettingsState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.receipt) {
      const wrote = result.receipt.wrote.length > 0;
      toast.show({ title: wrote ? t("saved") : t("unchanged"), tone: wrote ? "success" : "info" });
      router.replace("/app/admin/settings");
    }
    return result;
  }, emptySettingsState);

  const changed = (field: keyof Values) => values[field].trim() !== initial[field].trim();
  const domainsChanged = removed.length > 0 || parseDomains(adding).length > 0;
  const unsaved = FORM_FIELDS.filter(changed).length + (domainsChanged ? 1 : 0);
  const dirty = unsaved > 0 && !state.receipt;

  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // `markup`, not `t()`: messages isolate their values in `<bdi>` (10 §3); a label or a summary line is a string.
  const plain = (chunks: string) => chunks;
  const message = (value: string) => {
    const [key, json] = value.split("|");
    const raw = json ? (JSON.parse(json) as Record<string, string | number>) : {};
    const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "number" ? formatNumber(v) : v]));
    return t.markup(`errors.${key}`, { ...values, bdi: plain });
  };
  const err = (field: string) => (state.errors[field] ? message(state.errors[field]) : undefined);
  const mark = (on: boolean) => (on ? "rounded-field outline-2 outline-accent" : "");
  const label = (text: string, on: boolean, visible = false): ReactNode => {
    const full = `${text}${on ? ` ${t("changed")}` : ""}`;
    return visible ? full : <span className="sr-only">{full}</span>;
  };

  const LABELS: Record<string, string> = {
    name: t("rows.name"),
    domains: t("rows.domains"),
    addDomains: t("labels.addDomains"),
    timeZone: t("rows.timeZone"),
    companyMetric: t("rows.companyMetric"),
    companyMinActiveMembers: t("rows.companyMinActiveMembers"),
    checkInRotationSeconds: t("labels.checkInRotation"),
    checkInGraceSeconds: t("labels.checkInGrace"),
    maxCoPresenters: t("rows.maxCoPresenters"),
    priorityRsvpHours: t("rows.priorityRsvpHours"),
    limitDocumentMb: t("labels.limitDocument"),
    limitAudioMb: t("labels.limitAudio"),
    limitImageMb: t("labels.limitImage"),
    limitPosterMb: t("labels.limitPoster"),
    ratingMinAggregate: t("rows.ratings"),
    emailFromName: t("labels.emailFromName"),
    emailReplyTo: t("labels.emailReplyTo"),
    allowJpegExport: t("rows.jpeg"),
  };

  const summary = summaryErrors(state, {
    fields: ["name", "domains", "addDomains", ...FORM_FIELDS.filter((f) => f !== "name")],
    label: (field) => LABELS[field] ?? field,
    message,
    fieldId: (field) => controlId(field === "domains" ? "addDomains" : field),
  });

  const number = (field: keyof Values, text: string, visible = false) => (
    <Field id={controlId(field)} label={label(text, changed(field), visible)} error={err(field)}>
      <div className={mark(changed(field))}>
        <Input name={field} type="number" inputMode="numeric" min={0} step={1} dir="ltr" className="w-32 text-center" value={values[field]} onChange={(e) => set(field)(e.target.value)} />
      </div>
    </Field>
  );

  return (
    <section aria-labelledby="settings-edit-heading" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="settings-edit-heading" className="text-h3 text-fg-heading">
          {t("editing")}
        </h2>
        <span aria-live="polite" className="text-caption font-bold text-accent">
          {unsaved > 0 ? t.rich("unsaved", { count: unsaved, value: formatNumber(unsaved), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null}
        </span>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="opened" value={JSON.stringify({ view })} />
        {state.formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{t(`errors.${state.formError}`)}</span>
          </p>
        ) : (
          <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} />
        )}

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <KvCard
              className={CARD}
              mode="edit"
              title={t("cards.org")}
              emptyValue={t("empty")}
              rows={[
                {
                  id: "name",
                  label: t("rows.name"),
                  value: null,
                  edit: (
                    <Field id={controlId("name")} label={label(t("rows.name"), changed("name"))} error={err("name")}>
                      <div className={mark(changed("name"))}>
                        <Input name="name" maxLength={120} value={values.name} onChange={(e) => set("name")(e.target.value)} />
                      </div>
                    </Field>
                  ),
                },
                {
                  id: "domains",
                  label: t("rows.domains"),
                  value: null,
                  edit: (
                    <div className={`flex flex-col gap-2 ${mark(domainsChanged)}`}>
                      {view.domains.map((d) => (
                        <Checkbox
                          key={d.id}
                          name="removeDomain"
                          value={d.id}
                          checked={removed.includes(d.id)}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setRemoved((r) => (on ? [...r, d.id] : r.filter((x) => x !== d.id)));
                          }}
                          label={t.markup("labels.removeDomain", { domain: d.domain, bdi: plain })}
                        />
                      ))}
                      {err("domains") ? <p className="text-caption text-error">{err("domains")}</p> : null}
                      <Field id={controlId("addDomains")} label={label(t("labels.addDomains"), parseDomains(adding).length > 0, true)} error={err("addDomains")}>
                        <Input name="addDomains" dir="ltr" value={adding} onChange={(e) => setAdding(e.target.value)} />
                      </Field>
                    </div>
                  ),
                },
                {
                  id: "timeZone",
                  label: t("rows.timeZone"),
                  value: null,
                  edit: (
                    <Field id={controlId("timeZone")} label={label(t("rows.timeZone"), changed("timeZone"))} error={err("timeZone")}>
                      <div className={mark(changed("timeZone"))}>
                        <Select name="timeZone" dir="ltr" value={values.timeZone} onChange={(e) => set("timeZone")(e.target.value)}>
                          {timeZones.map((z) => (
                            <option key={z} value={z}>
                              {z}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </Field>
                  ),
                },
                {
                  id: "companyMetric",
                  label: t("rows.companyMetric"),
                  value: null,
                  edit: (
                    <Field id={controlId("companyMetric")} label={label(t("rows.companyMetric"), changed("companyMetric"))} error={err("companyMetric")}>
                      <div className={mark(changed("companyMetric"))}>
                        <Select name="companyMetric" value={values.companyMetric} onChange={(e) => set("companyMetric")(e.target.value)}>
                          <option value="total_points">{t("values.metric.total_points")}</option>
                          <option value="points_per_active_member">{t("values.metric.points_per_active_member")}</option>
                        </Select>
                      </div>
                    </Field>
                  ),
                },
                { id: "companyMinActiveMembers", label: t("rows.companyMinActiveMembers"), value: null, edit: number("companyMinActiveMembers", t("rows.companyMinActiveMembers")) },
              ]}
            />
            <KvCard
              className={CARD}
              mode="edit"
              title={t("cards.sessions")}
              emptyValue={t("empty")}
              rows={[
                {
                  id: "checkIn",
                  label: t("rows.checkIn"),
                  value: null,
                  edit: (
                    <div className="flex flex-wrap items-end gap-4">
                      {/* ★ wave 27 (REQ-CHK-019): «لا يتغيّر» posts the rotation EMPTY, which the action reads as null. The
                          last period typed is kept beside the switch, so turning it back on restores it. */}
                      {values.checkInRotationSeconds === "" ? (
                        <input type="hidden" name="checkInRotationSeconds" value="" />
                      ) : (
                        number("checkInRotationSeconds", t("labels.checkInRotation"), true)
                      )}
                      <div className={`w-fit ${mark(changed("checkInRotationSeconds") && values.checkInRotationSeconds === "")}`}>
                        <Switch
                          label={t("labels.checkInFixed")}
                          checked={values.checkInRotationSeconds === ""}
                          onCheckedChange={(on) => {
                            if (on) {
                              if (values.checkInRotationSeconds !== "") setLastRotation(values.checkInRotationSeconds);
                              set("checkInRotationSeconds")("");
                            } else set("checkInRotationSeconds")(lastRotation);
                          }}
                        />
                      </div>
                      {number("checkInGraceSeconds", t("labels.checkInGrace"), true)}
                    </div>
                  ),
                },
                { id: "maxCoPresenters", label: t("rows.maxCoPresenters"), value: null, edit: number("maxCoPresenters", t("rows.maxCoPresenters")) },
                { id: "priorityRsvpHours", label: t("rows.priorityRsvpHours"), value: null, edit: number("priorityRsvpHours", t("rows.priorityRsvpHours")) },
                {
                  id: "limits",
                  label: t("rows.limits"),
                  value: null,
                  edit: (
                    <div className="flex flex-wrap gap-4">
                      {number("limitDocumentMb", t("labels.limitDocument"), true)}
                      {number("limitAudioMb", t("labels.limitAudio"), true)}
                      {number("limitImageMb", t("labels.limitImage"), true)}
                      {number("limitPosterMb", t("labels.limitPoster"), true)}
                    </div>
                  ),
                },
              ]}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <KvCard
              className={CARD}
              mode="edit"
              title={t("cards.privacy")}
              emptyValue={t("empty")}
              rows={[{ id: "ratings", label: t("rows.ratings"), value: null, edit: number("ratingMinAggregate", t("rows.ratings")) }]}
            />
            <KvCard
              className={CARD}
              mode="edit"
              title={t("cards.integrations")}
              emptyValue={t("empty")}
              rows={[
                { id: "calendar", label: t("rows.calendar"), value: derived.calendar },
                {
                  id: "email",
                  label: t("rows.email"),
                  value: null,
                  edit: (
                    <div className="flex flex-col gap-3">
                      <Field id={controlId("emailFromName")} label={label(t("labels.emailFromName"), changed("emailFromName"), true)} error={err("emailFromName")}>
                        <div className={mark(changed("emailFromName"))}>
                          <Input name="emailFromName" maxLength={120} value={values.emailFromName} onChange={(e) => set("emailFromName")(e.target.value)} />
                        </div>
                      </Field>
                      <Field id={controlId("emailReplyTo")} label={label(t("labels.emailReplyTo"), changed("emailReplyTo"), true)} error={err("emailReplyTo")}>
                        <div className={mark(changed("emailReplyTo"))}>
                          <Input name="emailReplyTo" type="email" dir="ltr" value={values.emailReplyTo} onChange={(e) => set("emailReplyTo")(e.target.value)} />
                        </div>
                      </Field>
                    </div>
                  ),
                },
                {
                  id: "jpeg",
                  label: t("rows.jpeg"),
                  value: null,
                  edit: (
                    <div className={`w-fit ${mark(changed("allowJpegExport"))}`}>
                      <Switch
                        name="allowJpegExport"
                        label={`${t("rows.jpeg")}${changed("allowJpegExport") ? ` ${t("changed")}` : ""}`}
                        labelHidden
                        checked={values.allowJpegExport === "on"}
                        onCheckedChange={(on) => set("allowJpegExport")(on ? "on" : "")}
                      />
                    </div>
                  ),
                },
                { id: "verify", label: t("rows.verify"), value: <bdi dir="ltr">{derived.verify}</bdi> },
              ]}
            />
          </div>
        </div>

        <ActionBar
          position="static"
          label={t("actions")}
          primary={
            <SubmitButton pendingLabel={t("saving")} disabled={hydrated && !dirty}>
              {unsaved > 0 ? `${t("save")} (${formatNumber(unsaved)})` : t("save")}
            </SubmitButton>
          }
          secondary={[
            <ButtonLink key="cancel" href="/app/admin/settings" variant="secondary" size="lg">
              {t("cancel")}
            </ButtonLink>,
          ]}
        />
      </form>

      <Dialog open={leavingTo !== null} onOpenChange={(open) => (open ? null : setLeavingTo(null))}>
        <DialogContent title={t("leave.title")} closeLabel={tDialog("close")}>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              onClick={() => {
                const to = leavingTo;
                setLeavingTo(null);
                if (to) rawRouter.push(to);
              }}
            >
              {t("leave.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("leave.stay")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
