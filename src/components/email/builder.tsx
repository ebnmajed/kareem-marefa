"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ROW_LAYOUTS, type BlockType, type DroppedBlock, type EmailBlock, type RowLayout } from "@kareem/mail-runtime";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { BlockLibrary } from "@/components/ui/block-library";
import { Button } from "@/components/ui/button";
import { EditorRail } from "@/components/ui/editor-rail";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { ChevronIcon, MoreIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/i18n/navigation";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import type { PreviewSession } from "@/lib/dal/notifications";
import { BlockFields } from "@/components/email/block-fields";
import { BlockGlyph } from "@/components/email/block-glyphs";
import { hasBlocking, runChecks } from "@/components/email/checks";
import { ChecksPanel } from "@/components/email/checks-panel";
import { chipBindings, labelKey, toDisplay, toStored, tokenMap } from "@/components/email/binding-labels";
import { emptyBlock } from "@/components/email/document";
import { EmailCanvas } from "@/components/email/email-canvas";
import { PreviewSheet } from "@/components/email/preview-sheet";
import { StylesPanel } from "@/components/email/styles-panel";
import {
  blockOf,
  commit,
  documentJson as documentJsonOf,
  duplicate,
  fromDocument,
  moveStep,
  place,
  redo,
  remove,
  rowOf,
  setStyles,
  undo,
  updateBlock,
  blockList,
  type Armed,
  type BuilderDoc,
  type History,
  type Place,
} from "@/components/email/builder-state";

// SCR-058 · the block builder — rebuilt from `AdminEmails.dc.html` and `AdminEmailAdd.dc.html` (wave 23, REQ-UIX-112,
// REQ-NTF-009 … REQ-NTF-015, DEC-199 §2, DEC-208, DEC-238 §4). The route renders bare (the studio frame), so this owns
// the viewport and draws its own bar, with the message's name as the page's `h1`.
//
// In the artboard's order: the BAR — back · name · state · undo/redo · the device toggle · «معاينة واختبار» · «احفظ
// وفعّل»; the RAIL — إضافة · الأنماط · التخطيطات · الفحوصات (its count; the plan's D5, `DEC-NEXT-34`) · الكتلة while a
// block is selected; the 300 px PANEL that swaps; the CANVAS — the one renderer's frame with `ui/block-canvas` over it.
//
// ★ EVERY DRAG HAS A TAP (DEC-093). A library tile ARMS on a tap and a slot places it; ▲▼ on the handle bar move a row
// one step and «انقل» arms it for a slot. The drag, where the browser offers one, calls the same placing.
// `wave23-notify-builder-taps.spec.ts` performs every one with `click()` alone.
//
// ★ THE SAVE IS WHAT IS SENT. A saved row is live at once — there is no stored draft, so «مسودة» means «not saved» and
// «احفظ وفعّل» says what the press does. The saved mark is the `updated_at` the server wrote, never the client's clock.

type RailKey = "add" | "styles" | "layouts" | "checks" | "block";

// ★ ONE LAYOUT IN THE DOM, NOT TWO. The phone's notice-and-checks and the desktop's rail-and-canvas used to be both
// rendered and one hidden by CSS, so a check was listed twice in the document (once behind `lg:hidden`) and every
// query for it found two. On the server the width is unknown and both are rendered, CSS choosing; in the browser only
// the one the width calls for. `lg` is 64rem, Tailwind's.
const WIDE = "(min-width: 64rem)";
function subscribeWide(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const wideNow = () => (typeof window.matchMedia === "function" ? window.matchMedia(WIDE).matches : null);
const useWide = () => useSyncExternalStore(subscribeWide, wideNow, () => null);

/** The drawn order of the library — نقاطك is drawn and not built (DEC-238 §4). */
const LIBRARY: readonly BlockType[] = ["paragraph", "image", "button", "divider", "spacer", "session_card", "poster", "qr", "logo", "certificate", "social"];
const LAYOUTS = Object.keys(ROW_LAYOUTS) as RowLayout[];

export interface EmailBuilderProps {
  messageKey: string;
  name: string;
  initialSubject: string;
  initialBlocks: unknown;
  /** The org's row, when it has one — `null` is the platform design, sent as is. */
  templateId: string | null;
  savedAt: string | null;
  /** A string row (DEC-081): its words in the design's frame, opened as paragraphs. */
  isStringRow: boolean;
  offered: readonly string[];
  timeZone: string;
  locale: string;
  session: PreviewSession | null;
  email: string | null;
  action: (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
  sendTest: () => Promise<{ status: string; retryAfterMinutes?: number }>;
  restore: (templateId: string) => Promise<void>;
}

export function EmailBuilder(props: EmailBuilderProps) {
  const { messageKey, offered } = props;
  const t = useTranslations("notifications.admin.emails.builder");
  const tb = useTranslations("notifications.admin.emails.blocks");
  const toast = useToast();
  const router = useRouter();

  const initial = useMemo(() => fromDocument(props.initialBlocks), [props.initialBlocks]);
  const [history, setHistory] = useState<History>({ past: [], present: initial.doc, future: [] });
  const doc = history.present;
  // What the stored document LOST on the way in, named until the admin changes anything (wave 10's rule, kept).
  const [initialDropped, setInitialDropped] = useState<DroppedBlock[]>(initial.dropped);
  const [subject, setSubject] = useState(props.initialSubject);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rail, setRail] = useState<RailKey>("add");
  const [addTab, setAddTab] = useState("blocks");
  const [armed, setArmed] = useState<{ key: string; armed: Armed } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [device, setDevice] = useState<600 | 375>(600);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [restoring, setRestoring] = useState<"ask" | "busy" | null>(null);
  /** Where the admin was going when the question was asked: the gallery (the back button), or a link's own URL. */
  const [leaving, setLeaving] = useState<string | null>(null);
  const wide = useWide();

  const json = useMemo(() => documentJsonOf(doc), [doc]);
  const blocks = useMemo(() => blockList(doc), [doc]);
  const label = (binding: string) => (t.has(`bindings.${labelKey(binding)}`) ? t(`bindings.${labelKey(binding)}`) : binding);
  const tokens = useMemo(() => tokenMap(offered, label), [offered]); // eslint-disable-line react-hooks/exhaustive-deps
  const chips = chipBindings(offered).map((binding) => ({ binding, token: tokens.get(binding)! }));
  const urlBindings = offered.filter((binding) => binding === "url");
  const typeLabel = (type: string) => (tb.has(`type.${type}`) ? tb(`type.${type}`) : type);

  const [state, dispatch] = useActionToast<SavedFormState>(props.action, emptySavedState(), (result) =>
    result.saved
      ? { title: t("saved"), tone: "success" }
      : result.formError
        ? { title: result.formError === "unknownBinding" ? t.markup("errors.unknownBinding", { binding: result.values.binding ?? "", bdi: (c) => c }) : t(`errors.${result.formError}`), tone: "error" }
        : null,
  );

  // ★ WHAT IS STORED (#55's rule): the test send renders the SAVED row, so it waits while the subject or the document
  // differs from it. The snapshot moves when the server says the save landed, never on the click.
  const [stored, setStored] = useState(() => ({ subject: props.initialSubject, doc: documentJsonOf(initial.doc), savedAt: props.savedAt }));
  const posted = useRef(stored);
  useEffect(() => {
    if (state.saved) setStored({ ...posted.current, savedAt: state.values.updatedAt ?? posted.current.savedAt });
  }, [state]);
  const unsaved = subject !== stored.subject || json !== stored.doc;

  // Leaving with changes asks — here, and at the browser's own door.
  useEffect(() => {
    if (!unsaved) return;
    const stay = (event: BeforeUnloadEvent) => event.preventDefault();
    // ★ Every in-app link asks, not only the back button (`DEC-259` §2.7) — `profile-edit.tsx`'s listener: a plain
    // press on a same-origin link that neither downloads nor opens a new tab.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      event.preventDefault();
      event.stopPropagation();
      // The locale router prefixes the path itself, so the link's own prefix comes off.
      const prefix = `/${props.locale}`;
      const path = url.pathname === prefix ? "/" : url.pathname.startsWith(`${prefix}/`) ? url.pathname.slice(prefix.length) : url.pathname;
      setLeaving(path + url.search + url.hash);
    };
    window.addEventListener("beforeunload", stay);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", stay);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved, props.locale]);

  const checks = useMemo(() => runChecks({ parsed: true, blocks, dropped: initialDropped, subject, offered }), [blocks, subject, offered, initialDropped]);
  const blocked = hasBlocking(checks);
  const blockingCount = checks.filter((check) => check.severity === "blocking").length;

  const apply = (next: BuilderDoc, select?: string | null) => {
    setInitialDropped([]);
    setHistory((h) => commit(h, next));
    if (select !== undefined) {
      setSelectedId(select);
      if (select) setRail("block");
    }
  };
  const select = (id: string | null) => {
    setSelectedId(id);
    setRail(id ? "block" : "add");
  };
  const disarm = () => {
    setArmed(null);
    setDragging(false);
  };
  const placeAt = (at: Place) => {
    if (!armed) return;
    const result = place(doc, armed.armed, at);
    disarm();
    apply(result.doc, result.select);
  };
  const arm = (key: string | null, make: () => Armed) => (key ? setArmed({ key, armed: make() }) : disarm());

  const selectedBlock = blockOf(doc, selectedId);
  const selectedRow = rowOf(doc, selectedId);
  const inCells = armed !== null && (armed.armed.kind === "block" || (armed.armed.kind === "move" && Boolean(doc.blocks[armed.armed.id])));

  const library = (
    <BlockLibrary
      label={t("add.blocksLabel")}
      items={LIBRARY.map((type) => ({ key: type, label: t(`library.${type}`), glyph: <BlockGlyph type={type} /> }))}
      armed={armed?.armed.kind === "block" ? armed.key : null}
      onArm={(key) => arm(key, () => ({ kind: "block", block: emptyBlock(key as BlockType) }))}
      onDragStart={(key, event) => {
        event.dataTransfer.setData("text/plain", key);
        setArmed({ key, armed: { kind: "block", block: emptyBlock(key as BlockType) } });
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    />
  );
  const layouts = (
    <BlockLibrary
      label={t("add.layoutsLabel")}
      variant="layouts"
      items={LAYOUTS.map((layout) => ({ key: layout, label: t(`layouts.${layout}`), weights: ROW_LAYOUTS[layout] }))}
      armed={armed?.armed.kind === "layout" ? armed.key : null}
      onArm={(key) => arm(key, () => ({ kind: "layout", layout: key as RowLayout }))}
      onDragStart={(key, event) => {
        event.dataTransfer.setData("text/plain", key);
        setArmed({ key, armed: { kind: "layout", layout: key as RowLayout } });
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    />
  );

  let panel: React.ReactNode;
  if (rail === "add") {
    panel = (
      <Tabs label={t("rail.add")} items={[{ value: "blocks", label: t("add.tabBlocks") }, { value: "layouts", label: t("add.tabLayouts") }]} value={addTab} onValueChange={setAddTab}>
        <div className="flex flex-col gap-4 pt-3">
          {addTab === "blocks" ? (
            <>
              {library}
              <h3 className="text-caption font-bold text-fg-muted">{t("add.layoutsHeading")}</h3>
              {layouts}
            </>
          ) : (
            layouts
          )}
        </div>
      </Tabs>
    );
  } else if (rail === "layouts") {
    panel = layouts;
  } else if (rail === "styles") {
    panel = <StylesPanel styles={doc.styles} onChange={(styles) => apply(setStyles(doc, styles))} />;
  } else if (rail === "checks") {
    panel = <ChecksPanel checks={checks} onSelectBlock={(id) => select(id)} />;
  } else if (selectedBlock) {
    panel = <BlockFields key={selectedBlock.id} block={selectedBlock} tokens={tokens} chips={chips} urlBindings={urlBindings} onChange={(block) => apply(updateBlock(doc, block.id, block))} />;
  } else if (selectedRow) {
    panel = (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            const result = duplicate(doc, selectedRow.id);
            apply(result.doc, result.select);
          }}
        >
          {t("block.duplicateRow")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => apply(remove(doc, selectedRow.id), null)}>
          {t("block.removeRow")}
        </Button>
      </div>
    );
  }

  const railItems = [
    { key: "add", label: t("rail.add"), glyph: "add" as const },
    { key: "styles", label: t("rail.styles"), glyph: "styles" as const },
    { key: "layouts", label: t("rail.layouts"), glyph: "layouts" as const },
    {
      key: "checks",
      label: t("rail.checks"),
      glyph: "checks" as const,
      ...(blockingCount > 0 ? { count: { value: blockingCount, label: t.markup("checksCount", { count: blockingCount, value: formatNumber(blockingCount), bdi: (c) => c }) } } : {}),
    },
    ...(selectedBlock || selectedRow ? [{ key: "block", label: t("rail.block"), glyph: "block" as const }] : []),
  ];

  const panelTitle =
    rail === "block" && selectedBlock ? (
      <bdi>{typeLabel(selectedBlock.type)}</bdi>
    ) : rail === "block" && selectedRow ? (
      t.rich("block.rowHeading", { layout: selectedRow.layout, bdi: (c) => <bdi>{c}</bdi> })
    ) : undefined;

  const state_ = unsaved ? t("unsaved") : stored.savedAt ? t.rich("savedAt", { time: formatDateTime(stored.savedAt, props.timeZone, props.locale), bdi: (c) => <bdi>{c}</bdi> }) : t("platform");

  const bar = (
    <header className="flex min-h-13 shrink-0 flex-wrap items-center gap-2.5 border-b border-edge px-4 py-2">
      <IconButton size="sm" variant="secondary" label={t("back")} onClick={() => (unsaved ? setLeaving("/app/admin/emails") : router.push("/app/admin/emails"))}>
        <ChevronIcon direction="back" />
      </IconButton>
      <h1 className="text-label font-bold text-fg-heading">
        <bdi>{props.name}</bdi>
      </h1>
      <span className="text-caption text-fg-muted" role="status">
        {state_}
      </span>
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-edge" />
      <IconButton size="sm" variant="ghost" label={t("undo")} disabled={history.past.length === 0} onClick={() => setHistory(undo)}>
        <ChevronIcon direction="forward" />
      </IconButton>
      <IconButton size="sm" variant="ghost" label={t("redo")} disabled={history.future.length === 0} onClick={() => setHistory(redo)}>
        <ChevronIcon direction="back" />
      </IconButton>
      <div role="radiogroup" aria-label={t("deviceLabel")} className="flex gap-1">
        {([600, 375] as const).map((width) => (
          <Button key={width} type="button" role="radio" aria-checked={device === width} variant={device === width ? "secondary" : "ghost"} size="sm" onClick={() => setDevice(width)}>
            {width === 600 ? t("desktop") : t("phone")}
          </Button>
        ))}
      </div>
      <span className="flex-1" />
      {armed ? (
        <span className="flex items-center gap-2 text-body-sm text-fg-heading">
          {t("add.armed")}
          <Button type="button" variant="ghost" size="sm" onClick={disarm}>
            {t("add.cancelArm")}
          </Button>
        </span>
      ) : null}
      {props.templateId ? (
        <Menu trigger={<IconButton size="sm" variant="ghost" label={t("more")}><MoreIcon /></IconButton>} items={[{ label: t("restore"), tone: "error", onSelect: () => setRestoring("ask") }]} align="end" />
      ) : null}
      <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
        {t("preview")}
      </Button>
      <form action={dispatch} noValidate onSubmit={() => (posted.current = { subject, doc: json, savedAt: stored.savedAt })}>
        <input type="hidden" name="key" value={messageKey} />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="blocks" value={json} />
        <SubmitButton size="sm" pendingLabel={t("saving")} disabled={blocked}>
          {t("save")}
        </SubmitButton>
      </form>
    </header>
  );

  const subjectRow = (
    <div className="border-b border-edge px-4 py-2">
      <Field label={t("subject")}>
        {/* ★ Shown in the canvas's tokens — «غدًا: {عنوان الجلسة}» — and kept in the stored syntax, `{{title}}`: what
            is typed is converted back on every change, so what is saved is exactly what the row has always held. */}
        <Input name="builder-subject" maxLength={200} value={toDisplay(subject, tokens)} onChange={(event) => setSubject(toStored(event.target.value, tokens))} />
      </Field>
      {props.isStringRow ? <p className="mt-1 text-caption text-fg-muted">{t("stringRow")}</p> : null}
    </div>
  );

  return (
    // The studio frame is a fixed viewport (`h-dvh overflow-hidden`), so the builder scrolls ITSELF below `lg`: the bar
    // wraps on a phone, and the notice and the checks under it must still be reachable. In normal flow there, never a
    // fixed-height flex column — that shrank the wrapped bar and let the notice paint over its buttons.
    <div className="h-dvh overflow-y-auto bg-canvas lg:flex lg:flex-col lg:overflow-hidden">
      {bar}

      {/* ── Below `lg`: the canvas is a desktop tool; the checks and the preview stay reachable ── */}
      {wide !== true ? (
        <div className="flex flex-col gap-4 p-4 lg:hidden">
          <Panel tone="info">
            <p className="text-body-sm text-fg-body">{t("phoneNotice")}</p>
          </Panel>
          {subjectRow}
          <ChecksPanel checks={checks} onSelectBlock={() => undefined} />
        </div>
      ) : null}

      {wide !== false ? (
        <div className="hidden min-h-0 flex-1 lg:flex">
          <EditorRail
            label={t("railLabel")}
            items={railItems}
            selected={rail}
            onSelect={(key) => setRail(key as RailKey)}
            {...(panelTitle ? { panelTitle } : {})}
            {...(rail === "block"
              ? {
                  panelAction: (
                    <Button type="button" variant="ghost" size="sm" onClick={() => select(null)}>
                      {t("block.close")}
                    </Button>
                  ),
                }
              : {})}
          >
            {panel}
          </EditorRail>

          <section aria-label={t("canvas.label")} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {subjectRow}
            <EmailCanvas
              messageKey={messageKey}
              subject={subject}
              documentJson={json}
              doc={doc}
              tokens={tokens}
              width={device}
              selectedId={selectedId}
              onSelect={select}
              typeLabel={typeLabel}
              actions={{
                moveUp: (id) => apply(moveStep(doc, id, "up")),
                moveDown: (id) => apply(moveStep(doc, id, "down")),
                move: (id) => setArmed({ key: `move:${id}`, armed: { kind: "move", id } }),
                duplicate: (id) => {
                  const result = duplicate(doc, id);
                  apply(result.doc, result.select);
                },
                remove: (id) => apply(remove(doc, id), selectedId === id ? null : selectedId),
              }}
              slots={armed ? { inCells, dragging, onPlace: placeAt, onCancel: disarm } : null}
              onRowDragStart={(id) => {
                setArmed({ key: `move:${id}`, armed: { kind: "move", id } });
                setDragging(true);
              }}
              onDropAt={placeAt}
              onEditText={(id, text) => {
                const block = doc.blocks[id];
                if (block && (block.type === "heading" || block.type === "paragraph")) apply(updateBlock(doc, id, { ...block, text }));
              }}
              onAlign={(id, align) => {
                const block = doc.blocks[id] as EmailBlock & { style?: { align?: string } };
                if (!block || !("style" in block || block.type === "heading" || block.type === "paragraph")) return;
                const style = { ...(block.style ?? {}), align: align === "start" ? undefined : align };
                const clean = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined));
                apply(updateBlock(doc, id, { ...block, style: Object.keys(clean).length ? clean : undefined } as EmailBlock));
              }}
            />
          </section>
        </div>
      ) : null}

      <PreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        messageKey={messageKey}
        subject={subject}
        documentJson={json}
        session={props.session}
        email={props.email}
        unsaved={unsaved}
        blocked={blocked}
        sendTest={props.sendTest}
      />

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => setRestoring(open ? "ask" : null)}
        title={t.rich("restoreTitle", { name: props.name, bdi: (c) => <bdi>{c}</bdi> })}
        body={<p>{t("restoreBody")}</p>}
        confirmLabel={t("restoreConfirm")}
        cancelLabel={t("cancel")}
        closeLabel={t("close")}
        pending={restoring === "busy"}
        onConfirm={async () => {
          if (!props.templateId) return;
          setRestoring("busy");
          try {
            await props.restore(props.templateId);
            setRestoring(null);
            toast.show({ title: t("restored"), tone: "success" });
            router.refresh();
          } catch {
            setRestoring("ask");
            toast.show({ title: t("restoreFailed"), tone: "error" });
          }
        }}
      />

      <ConfirmDialog
        open={leaving !== null}
        onOpenChange={(open) => (open ? null : setLeaving(null))}
        title={t("leaveTitle")}
        body={<p>{t("leaveBody")}</p>}
        confirmLabel={t("leaveConfirm")}
        cancelLabel={t("stay")}
        closeLabel={t("close")}
        onConfirm={() => {
          const target = leaving;
          setLeaving(null);
          router.push(target ?? "/app/admin/emails");
        }}
      />
    </div>
  );
}
