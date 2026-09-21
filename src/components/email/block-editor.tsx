"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BLOCK_TYPES, readDocument, SCHEMA_VERSION, type BlockType, type EmailBlock } from "@kareem/mail-runtime";
import { emptySavedState, type SavedFormState } from "@/components/admin/saved-form-state";
import { useActionToast } from "@/components/admin/use-action-toast";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { Textarea } from "@/components/ui/textarea";
import { ChecksPanel } from "@/components/email/checks-panel";
import { blockName, hasBlocking, runChecks } from "@/components/email/checks";
import { PreviewPane, type PreviewMode } from "@/components/email/preview-pane";

// SCR-058's three panes — `16` §11.4, REQ-NTF-009, REQ-NTF-010, REQ-DSG-028.
//
// Blocks · live preview · properties, the shape the studio uses (§10.2) so an
// admin learns one tool.
//
// ★ THE DOCUMENT IS THE STATE, AND THE PREVIEW IS A FUNCTION OF IT. Nothing
// here renders a mail: the preview posts the document to the one renderer and
// frames what comes back, so what an admin approves is what the worker sends.
// The checks are computed from the same document, so the panel and the frame
// can never describe different mails.
//
// ★ NO DRAG (`DEC-160` §5, `SC 2.5.7`). `ui/reorderable-list` moves a row by
// ▲▼, named by the row they move. Drag is the enhancement and nobody needs it
// to conform.

let counter = 0;
/** A stable id for a new block. `readDocument()` requires one, and the
 *  reorderable list keeps a row's DOM — and its focus — by it. */
function newId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter}`;
}

function emptyBlock(type: BlockType): EmailBlock {
  const id = newId();
  switch (type) {
    case "heading":
      return { type, id, text: "", level: 1 };
    case "paragraph":
      return { type, id, text: "" };
    case "button":
      return { type, id, label: "", urlBinding: "", style: "primary" };
    case "session_card":
      return { type, id };
    case "detail_list":
      return { type, id, items: [{ label: "", value: "" }] };
    case "divider":
      return { type, id };
    case "spacer":
      return { type, id, height: "md" };
    case "image":
      return { type, id, src: { kind: "org_logo" }, alt: "", width: 160 };
  }
}

export function BlockEditor({
  messageKey,
  initialSubject,
  initialBody,
  initialBlocks,
  offered,
  action,
}: {
  messageKey: string;
  initialSubject: string;
  initialBody: string;
  /** The stored document, or null for a string template. */
  initialBlocks: unknown;
  /** What this key offers, from `public.notification_bindings()`. */
  offered: readonly string[];
  action: (previous: SavedFormState, formData: FormData) => Promise<SavedFormState>;
}) {
  const t = useTranslations("notifications.admin.emails.editor");
  const tb = useTranslations("notifications.admin.emails.blocks");
  const [state, dispatch] = useActionToast<SavedFormState>(action, emptySavedState(), (result) =>
    result.saved ? { title: t("saved"), tone: "success" } : result.formError ? { title: t(`errors.${result.formError}`), tone: "error" } : null,
  );

  const [subject, setSubject] = useState(initialSubject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => readDocument(initialBlocks).blocks);
  // ★ WHAT THE STORED DOCUMENT LOST ON THE WAY IN, kept rather than discarded.
  // `readDocument()` drops a malformed or unrecognised block, and an editor
  // that swallowed that would show an admin a document SHORTER than the one
  // stored and let them save it — silently deleting a row they never saw. It
  // is cleared the moment they change anything, because from then on the
  // document in front of them is the whole truth.
  const [initialDropped, setInitialDropped] = useState(() => readDocument(initialBlocks).dropped);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>("phone");

  const documentJson = useMemo(
    () => (blocks.length > 0 ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, blocks }) : ""),
    [blocks],
  );

  // The checks read the SAME document the preview posts, so the panel and the
  // frame cannot describe different mails. `dropped` is empty here because the
  // editor's own blocks are well-formed by construction; the renderer's drops
  // arrive with the preview and are shown by the frame's own state.
  const checks = useMemo(
    () => runChecks({ parsed: true, blocks, dropped: initialDropped, subject, offered }),
    [blocks, subject, offered, initialDropped],
  );

  const blocked = hasBlocking(checks);
  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const typeLabel = (type: string) => (tb.has(`type.${type}`) ? tb(`type.${type}`) : type);
  const editBlocks = (next: (current: EmailBlock[]) => EmailBlock[]) => {
    setInitialDropped([]);
    setBlocks(next);
  };
  const update = (id: string, next: Partial<EmailBlock>) =>
    setBlocks((current) => current.map((block) => (block.id === id ? ({ ...block, ...next } as EmailBlock) : block)));

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
      {/* ── الكتل ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="blocks-heading" className="min-w-0">
        <h3 id="blocks-heading" className="text-label text-fg-heading">
          {tb("heading")}
        </h3>

        <div className="mt-3 flex flex-wrap gap-2">
          {BLOCK_TYPES.map((type) => (
            <Button key={type} type="button" variant="ghost" onClick={() => {
              const block = emptyBlock(type);
              editBlocks((current) => [...current, block]);
              setSelectedId(block.id);
            }}>
              {tb(`add.${type}`)}
            </Button>
          ))}
        </div>

        <div className="mt-4">
          <ReorderableList
            items={blocks}
            getKey={(block) => block.id}
            getName={(block) => blockName(block, typeLabel)}
            size="sm"
            label={tb("listLabel")}
            onReorder={(nextKeys) =>
              editBlocks((current) => nextKeys.map((key) => current.find((block) => block.id === key)!).filter(Boolean))
            }
            renderItem={(block) => (
              <button
                type="button"
                onClick={() => setSelectedId(block.id)}
                aria-current={block.id === selectedId ? "true" : undefined}
                className={`w-full text-start text-body-sm ${block.id === selectedId ? "text-fg-heading" : "text-fg-muted"}`}
              >
                {blockName(block, typeLabel)}
              </button>
            )}
            renderActions={(block) => (
              <Button type="button" variant="ghost" onClick={() => {
                editBlocks((current) => current.filter((b) => b.id !== block.id));
                setSelectedId((id) => (id === block.id ? null : id));
              }}>
                {tb("remove")}
              </Button>
            )}
          />
        </div>

        {/* ★ The footer is shown as a fixed last row, outside the reorderable
            set: it is composed and cannot move or be deleted, and a pane that
            hid it would tell an admin the mail ends at their last block when
            it does not (`REQ-NTF-005`). */}
        <p className="mt-3 rounded-lg border border-edge px-3 py-2 text-body-sm text-fg-muted">{tb("footerRow")}</p>
      </section>

      {/* ── معاينة حيّة ───────────────────────────────────────────────── */}
      <div className="min-w-0">
        <Field id="editor-subject" label={t("subject")} required>
          <Input
            name="subject"
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        {/* ★ The save is BLOCKED while any check is: a mail an admin has not
            seen is a mail they must not be able to approve. The panel says
            which check, and names the block. */}
        <form action={dispatch} noValidate className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="key" value={messageKey} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="blocks" value={documentJson} />
          <SubmitButton pendingLabel={t("saving")} disabled={blocked}>{t("save")}</SubmitButton>
          {blocked ? <span className="text-body-sm text-fg-muted">{t("blockedBySaveChecks")}</span> : null}
          {state.formError ? <span className="text-body-sm text-error">{t(`errors.${state.formError}`)}</span> : null}
        </form>

        <div className="mt-4">
          <PreviewPane
            messageKey={messageKey}
            subject={subject}
            body={initialBody}
            blocks={documentJson}
            mode={mode}
            onModeChange={setMode}
          />
        </div>
      </div>

      {/* ── خصائص الكتلة ─────────────────────────────────────────────── */}
      <section aria-labelledby="properties-heading" className="min-w-0">
        <h3 id="properties-heading" className="text-label text-fg-heading">
          {t("properties")}
        </h3>

        {selected === null ? (
          <p className="mt-3 text-body-sm text-fg-muted">{t("selectABlock")}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {(selected.type === "heading" || selected.type === "paragraph") && (
              <Field id="prop-text" label={t("text")}>
                <Textarea
                  rows={selected.type === "heading" ? 2 : 6}
                  className="leading-[1.7]"
                  value={selected.text}
                  onChange={(event) => update(selected.id, { text: event.target.value } as Partial<EmailBlock>)}
                />
              </Field>
            )}
            {selected.type === "button" && (
              <>
                <Field id="prop-label" label={t("label")}>
                  <Input value={selected.label} onChange={(e) => update(selected.id, { label: e.target.value } as Partial<EmailBlock>)} />
                </Field>
                <Field id="prop-url" label={t("urlBinding")} hint={t("urlBindingHint")}>
                  <Input dir="ltr" value={selected.urlBinding} onChange={(e) => update(selected.id, { urlBinding: e.target.value } as Partial<EmailBlock>)} />
                </Field>
              </>
            )}
            {selected.type === "image" && (
              <Field id="prop-alt" label={t("alt")} hint={t("altHint")} required>
                <Input value={selected.alt} onChange={(e) => update(selected.id, { alt: e.target.value } as Partial<EmailBlock>)} />
              </Field>
            )}

            {/* ★ The fields this message offers, listed rather than typed
                (`REQ-NTF-012`): an admin cannot invent a binding that renders
                empty, and the database refuses one anyway. */}
            <div>
              <h4 className="text-label text-fg-heading">{t("availableFields")}</h4>
              <ul className="mt-2 space-y-1">
                {offered.map((binding) => (
                  <li key={binding} className="text-body-sm text-fg-muted">
                    <code dir="ltr">{`{{${binding}}}`}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <ChecksPanel checks={checks} onSelectBlock={setSelectedId} />
      </section>
    </div>
  );
}
