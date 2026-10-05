"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter as useRawRouter } from "next/navigation";
import { formatNumber } from "@/components/sessions/numerals";
import { ActionBar } from "@/components/ui/action-bar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { summaryErrors } from "@/lib/form-state";
import { emptyRecognitionState, field, type RecognitionOpened, type RecognitionState } from "./state";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// SCR-054 in EDIT mode — `REQ-UIX-091`, `REQ-UIX-101`, `DEC-231` §3, `DEC-232` §3, in the shape `053` and `060` share.
// ★ Edit mode names its state, counts the unsaved changes, marks each changed field by the accent AND «(معدّل)»;
// ★ nothing is written before «احفظ», and one save is one transaction (`save_recognition()`); a switch STAGES its change
// as a real posted checkbox; ★ not inside `data-table` (a control in a cell exists twice — the table and the stack).
// ★ The monthly streak shows its count and switch only: `bonus_points` is read by nothing and is not offered
// (`DEC-232` §4 row 2) — its payout is SCR-053's «سلسلة الحضور الشهرية».
// ★ A badge's description, rule and certificate flag are its sheet's (`?badge=<id>`); here, its name and its switch.

const plain = (chunks: string) => chunks;

type Values = Record<string, string | boolean>;

export function RecognitionEdit({
  action,
  opened,
  levelOptions,
  badgeOptions,
}: {
  action: (previous: RecognitionState, formData: FormData) => Promise<RecognitionState>;
  opened: RecognitionOpened;
  levelOptions: { id: string; name: string }[];
  badgeOptions: { id: string; name: string }[];
}) {
  const t = useTranslations("recognition.admin");
  const tDialog = useTranslations("ui.dialog");
  const toast = useToast();
  const router = useRouter();
  const rawRouter = useRawRouter();
  const hydrated = useHydrated();

  const [initial] = useState<Values>(() => {
    const v: Values = {};
    for (const l of opened.levels) {
      v[field("level", l.id, "name")] = l.name;
      v[field("level", l.id, "threshold")] = String(l.thresholdPoints);
    }
    for (const b of opened.badges) {
      v[field("badge", b.id, "name")] = b.name;
      v[field("badge", b.id, "enabled")] = !b.retired;
    }
    for (const p of opened.perks) {
      v[field("perk", p.id, "enabled")] = p.enabled;
      v[field("perk", p.id, "qualifier")] = p.requiredLevelId ? `level:${p.requiredLevelId}` : p.requiredBadgeId ? `badge:${p.requiredBadgeId}` : "";
    }
    for (const s of opened.streaks) {
      v[field("streak", s.id, "count")] = String(s.requiredCount);
      v[field("streak", s.id, "enabled")] = s.enabled;
    }
    return v;
  });
  const [values, setValues] = useState(initial);
  const set = (name: string, value: string | boolean) => setValues((all) => ({ ...all, [name]: value }));
  const changed = (name: string) => values[name] !== initial[name];

  const [state, formAction] = useActionState<RecognitionState, FormData>(async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.receipt) {
      const wrote = result.receipt.wrote.length > 0;
      toast.show({ title: wrote ? t("read.saved") : t("read.unchanged"), tone: wrote ? "success" : "info" });
      router.replace("/app/admin/recognition");
    }
    return result;
  }, emptyRecognitionState);

  const unsaved = Object.keys(initial).filter(changed).length;
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

  const labels: Record<string, string> = {};
  for (const l of opened.levels) {
    labels[field("level", l.id, "name")] = t.markup("read.nameOf", { name: l.name, bdi: plain });
    labels[field("level", l.id, "threshold")] = t.markup("read.thresholdOf", { name: l.name, bdi: plain });
  }
  for (const b of opened.badges) labels[field("badge", b.id, "name")] = t.markup("read.nameOf", { name: b.name, bdi: plain });
  for (const p of opened.perks) labels[field("perk", p.id, "qualifier")] = t.markup("read.qualifierOf", { name: t(`perks.${p.key}`), bdi: plain });
  for (const s of opened.streaks) labels[field("streak", s.id, "count")] = t("streaks.requiredCountLabel");

  const err = (name: string) => (state.errors[name] ? t(`read.errors.${state.errors[name]}`) : undefined);
  const changedWord = (c: boolean) => (c ? ` ${t("read.changed")}` : "");
  const mark = (c: boolean) => (c ? "rounded-field outline-2 outline-accent" : "");
  const summary = summaryErrors(state, { fields: Object.keys(labels), label: (f) => labels[f] ?? f, message: (key) => t(`read.errors.${key}`), fieldId: (f) => f });

  const text = (name: string, opts: { numeric?: boolean; maxLength?: number; className?: string } = {}) => (
    <Field id={name} label={<span className="sr-only">{`${labels[name]}${changedWord(changed(name))}`}</span>} error={err(name)}>
      <Input
        name={name}
        value={String(values[name])}
        maxLength={opts.maxLength}
        inputMode={opts.numeric ? "numeric" : undefined}
        dir={opts.numeric ? "ltr" : undefined}
        onChange={(e) => set(name, e.target.value)}
        className={`${opts.className ?? ""} ${mark(changed(name))}`}
      />
    </Field>
  );
  const toggle = (name: string, rowName: string) => (
    <div className={`w-fit ${mark(changed(name))}`}>
      <Switch name={name} label={`${t("read.colEnabled")}${changedWord(changed(name))} — ${rowName}`} labelHidden checked={values[name] === true} onCheckedChange={(next) => set(name, next)} />
    </div>
  );
  const grid = (cols: string) => `md:grid ${cols} md:items-start md:gap-3 flex flex-col gap-2 py-3 min-w-0`;
  const block = (id: string, heading: string, headers: string[], cols: string, rows: React.ReactNode) => (
    <div id={id} className="flex flex-col gap-2">
      <h3 className="text-label text-fg-heading">{heading}</h3>
      <div className="rounded-panel border border-edge bg-surface px-4">
        <div aria-hidden="true" className={`hidden border-b border-edge py-2 text-label text-fg-muted md:grid ${cols} md:gap-3`}>
          {headers.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        <ul className="divide-y divide-edge">{rows}</ul>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="recognition-edit-heading" className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="recognition-edit-heading" className="text-h3 text-fg-heading">
          {t("read.editing")}
        </h2>
        <span aria-live="polite" className="text-caption font-bold text-accent">
          {unsaved > 0 ? t.rich("read.unsaved", { count: unsaved, value: formatNumber(unsaved), bdi: (chunks) => <bdi>{chunks}</bdi> }) : null}
        </span>
      </div>

      <form action={formAction} noValidate className="flex flex-col gap-6">
        <input type="hidden" name="opened" value={JSON.stringify(opened)} />
        {state.formError ? (
          <p role="alert" className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error">
            <AlertCircleIcon className="mt-[0.2em]" />
            <span>{t(`read.errors.${state.formError}`)}</span>
          </p>
        ) : (
          <FormSummary key={state.attempt} title={t("read.errorSummaryTitle")} errors={summary} />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {block(
            "levels-edit",
            t("levels.heading"),
            [t("read.colLevel"), t("read.colFrom")],
            "md:grid-cols-[minmax(0,1fr)_8rem]",
            opened.levels.map((l) => (
              <li key={l.id}>
                <fieldset className={grid("md:grid-cols-[minmax(0,1fr)_8rem]")}>
                  <legend className="sr-only">{l.name}</legend>
                  {text(field("level", l.id, "name"), { maxLength: 60 })}
                  {text(field("level", l.id, "threshold"), { numeric: true, className: "text-center" })}
                </fieldset>
              </li>
            )),
          )}
          {block(
            "badges-edit",
            t("badges.heading"),
            [t("read.colBadge"), t("read.colEnabled")],
            "md:grid-cols-[minmax(0,1fr)_5rem]",
            opened.badges.map((b) => (
              <li key={b.id}>
                <fieldset className={grid("md:grid-cols-[minmax(0,1fr)_5rem]")}>
                  <legend className="sr-only">{b.name}</legend>
                  {text(field("badge", b.id, "name"), { maxLength: 100 })}
                  {toggle(field("badge", b.id, "enabled"), b.name)}
                </fieldset>
              </li>
            )),
          )}
        </div>

        {block(
          "perks-edit",
          t("perks.heading"),
          [t("perks.colPerk"), t("perks.colQualifier"), t("read.colEnabled")],
          "md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5rem]",
          opened.perks.map((p) => {
            const name = field("perk", p.id, "qualifier");
            return (
              <li key={p.id}>
                <fieldset className={grid("md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5rem]")}>
                  <legend className="sr-only">{t(`perks.${p.key}`)}</legend>
                  <span className="text-body text-fg-heading md:pt-3">{t(`perks.${p.key}`)}</span>
                  <Field id={name} label={<span className="sr-only">{`${labels[name]}${changedWord(changed(name))}`}</span>} error={err(name)}>
                    <Select name={name} value={String(values[name])} onChange={(e) => set(name, e.target.value)} className={mark(changed(name))}>
                      <option value="">{t("perks.choose")}</option>
                      <optgroup label={t("perks.byLevel")}>
                        {levelOptions.map((o) => (
                          <option key={o.id} value={`level:${o.id}`}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={t("perks.byBadge")}>
                        {badgeOptions.map((o) => (
                          <option key={o.id} value={`badge:${o.id}`}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                  </Field>
                  {toggle(field("perk", p.id, "enabled"), t(`perks.${p.key}`))}
                </fieldset>
                {/* The hosting gate keeps its warning where the switch is (`REQ-REC-008`: off by default). */}
                {p.key === "can_host" ? <p className="pb-3 text-caption text-fg-muted">{t("perks.canHostWarning")}</p> : null}
              </li>
            );
          }),
        )}

        {block(
          "streaks-edit",
          t("streaks.heading"),
          [t("streaks.colStreak"), t("read.colRule"), t("read.colEnabled")],
          "md:grid-cols-[minmax(0,1fr)_8rem_5rem]",
          opened.streaks.map((s) => (
            <li key={s.id}>
              <fieldset className={grid("md:grid-cols-[minmax(0,1fr)_8rem_5rem]")}>
                <legend className="sr-only">{t("streaks.name")}</legend>
                <span className="text-body text-fg-heading md:pt-3">{t("streaks.name")}</span>
                {text(field("streak", s.id, "count"), { numeric: true, className: "text-center" })}
                {toggle(field("streak", s.id, "enabled"), t("streaks.name"))}
              </fieldset>
            </li>
          )),
        )}

        <ActionBar
          position="static"
          label={t("read.actions")}
          primary={
            <SubmitButton pendingLabel={t("common.saving")} disabled={hydrated && !dirty}>
              {unsaved > 0 ? `${t("read.save")} (${formatNumber(unsaved)})` : t("read.save")}
            </SubmitButton>
          }
          secondary={[
            <ButtonLink key="cancel" href="/app/admin/recognition" variant="secondary" size="lg">
              {t("common.cancel")}
            </ButtonLink>,
          ]}
        />
      </form>

      <Dialog open={leavingTo !== null} onOpenChange={(open) => (open ? null : setLeavingTo(null))}>
        <DialogContent title={t("read.leave.title")} closeLabel={tDialog("close")}>
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
              {t("read.leave.confirm")}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="md">
                {t("read.leave.stay")}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
