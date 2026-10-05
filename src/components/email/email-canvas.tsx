"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { EmailBlock } from "@kareem/mail-runtime";
import type { BlockCanvasBox, BlockCanvasPlace, BlockCanvasRow, BlockCanvasTarget } from "@/components/ui";
import { BlockCanvas } from "@/components/ui/block-canvas";
import { Button } from "@/components/ui/button";
import { CanvasStage } from "@/components/ui/canvas-stage";
import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { Textarea } from "@/components/ui/textarea";
import { blockName } from "@/components/email/checks";
import { targetIdOf, type BuilderDoc } from "@/components/email/builder-state";
import { toDisplay, toStored, type TokenMap } from "@/components/email/binding-labels";
import { useHydrated } from "@/lib/hooks/use-hydrated";

// The builder's canvas — wave 23, REQ-UIX-112, REQ-NTF-010, DEC-093, DEC-237 §3, `AdminEmails.dc.html`.
//
// ★ THE CANVAS IS THE ONE RENDERER. The mail shown is `/api/admin/emails/preview`'s HTML — `renderEmail()`, the
// function the worker sends with — posted into a named, sandboxed frame (the wave-10 mechanism, never `srcdoc`, which
// would inherit the console's CSP and draw the mail unstyled). In the canvas's mode every binding shows as its Arabic
// token and every block's row carries its id; this component reads where each row landed and hands the boxes to
// `ui/block-canvas`, which draws the selection, the handle bar and the slots over the frame. A React-drawn mail would
// be the second renderer `REQ-NTF-010` forbids: an admin would edit one thing and send another.
//
// ★ NO TIMER (`DEC-146`). The frame is posted when the committed document or the width changes — events — and
// measured on its own `load`. Fields commit on blur, so it never reloads under a cursor.
//
// The stage around it is `ui/canvas-stage`'s, at 100 %: the mail is 600 px or the phone's 375, never scaled, so the
// boxes the frame reports are the boxes the overlay draws.

export interface EmailCanvasProps {
  messageKey: string;
  subject: string;
  /** The committed document, as the save would post it. */
  documentJson: string;
  doc: BuilderDoc;
  tokens: TokenMap;
  width: 600 | 375;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  actions: { moveUp: (id: string) => void; moveDown: (id: string) => void; move: (id: string) => void; duplicate: (id: string) => void; remove: (id: string) => void };
  /** Null hides the slots. */
  slots: null | { inCells: boolean; dragging: boolean; onPlace: (at: BlockCanvasPlace) => void; onCancel: () => void };
  onRowDragStart: (id: string) => void;
  onDropAt: (at: BlockCanvasPlace) => void;
  /** A text block's words, edited over the canvas. */
  onEditText: (id: string, stored: string) => void;
  onAlign: (id: string, align: "start" | "center" | "end") => void;
  typeLabel: (type: string) => string;
}

interface Measured {
  height: number;
  rows: BlockCanvasRow[];
  fixed: BlockCanvasTarget[];
}

const EMPTY: Measured = { height: 480, rows: [], fixed: [] };

function boxOf(el: Element): BlockCanvasBox {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function EmailCanvas(props: EmailCanvasProps) {
  const { messageKey, subject, documentJson, doc, tokens, width, selectedId, onSelect, typeLabel } = props;
  const t = useTranslations("notifications.admin.emails.builder.canvas");
  const tb = useTranslations("notifications.admin.emails.builder.block");
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [measured, setMeasured] = useState<Measured>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  // ★ THE FRAME AND ITS FORM EXIST ONLY IN THE BROWSER, under a name no other element can share. Rendered on the
  // server, the iframe also lands in the streamed segment Next leaves behind on a hard load (DEC-145's orphan): two
  // frames called `mail-canvas`, and the form's POST went into the orphan — which was then removed — while the visible
  // frame stayed `about:blank`, so the canvas measured nothing and drew no target (wave 23, found on a production
  // build). A client-only frame has no orphan copy, and `useId` keeps its name its own.
  const hydrated = useHydrated();
  const frameName = `mail-canvas-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // The frame is the renderer's answer to the committed document; a new one is asked for when it changes.
  useEffect(() => {
    if (hydrated) form.current?.requestSubmit();
  }, [hydrated, documentJson, width, messageKey]);

  const labelOf = useCallback((block: EmailBlock | undefined) => (block ? blockName(block, typeLabel) : ""), [typeLabel]);

  const measure = useCallback(() => {
    const d = frame.current?.contentDocument;
    if (!d?.body) return;
    const find = (id: string) => d.querySelector(`tr[data-k="${CSS.escape(id)}"]`);
    const rows: BlockCanvasRow[] = [];
    let bottom = 0;
    for (const row of doc.rows) {
      const id = targetIdOf(row);
      const el = find(id);
      if (!el) continue;
      const box = boxOf(el);
      bottom = Math.max(bottom, box.top + box.height);
      if (row.layout === "1" && row.columns[0]!.length === 1) {
        rows.push({ id, label: labelOf(doc.blocks[id]), box });
        continue;
      }
      const columns = [...el.querySelectorAll(":scope > td > div")];
      rows.push({
        id,
        label: t.markup("row", { layout: row.layout, bdi: (chunks) => chunks }),
        box,
        cells: row.columns.map((ids, index) => ({
          box: columns[index] ? boxOf(columns[index]!) : box,
          blocks: ids.flatMap((blockId) => {
            const cell = find(blockId);
            return cell ? [{ id: blockId, label: labelOf(doc.blocks[blockId]), box: boxOf(cell) }] : [];
          }),
        })),
      });
    }
    const card = d.querySelector('table[style*="max-width:560px"]');
    const fixed: BlockCanvasTarget[] = [];
    if (card) {
      const c = boxOf(card);
      const top = Math.max(bottom, c.top);
      fixed.push({ id: "footer", label: t("footer"), box: { left: c.left, top, width: c.width, height: c.top + c.height - top } });
    }
    setMeasured({ height: d.documentElement.scrollHeight, rows, fixed });
  }, [doc, labelOf, t]);

  // A new document's rows may not match the frame until it reloads; the frame's load measures.
  useEffect(() => {
    measure();
  }, [measure]);

  // ★ The frame's own `load`, listened for natively as well as through React's `onLoad`: the measure must run on every
  // document the renderer hands back, whatever React does with an iframe it hydrated.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    el.addEventListener("load", measure);
    return () => el.removeEventListener("load", measure);
  }, [measure, hydrated]);

  const selectedBox =
    measured.rows.find((row) => row.id === selectedId)?.box ??
    measured.rows.flatMap((row) => (row.cells ?? []).flatMap((cell) => cell.blocks)).find((block) => block.id === selectedId)?.box ??
    null;
  const selectedBlock = selectedId ? doc.blocks[selectedId] : undefined;
  const textual = selectedBlock && (selectedBlock.type === "heading" || selectedBlock.type === "paragraph") ? selectedBlock : null;
  const align = textual?.style?.align ?? "start";

  return (
    <CanvasStage label={t("label")} contentWidth={width} zoom={1} className="min-h-0 flex-1">
      {() => (
        <BlockCanvas
          label={t("label")}
          width={width}
          rows={measured.rows}
          fixed={measured.fixed}
          selectedId={selectedId}
          onSelect={(id) => {
            setEditing(null);
            onSelect(id);
          }}
          actions={props.actions}
          labels={{ moveUp: t("moveUp"), moveDown: t("moveDown"), move: t("move"), duplicate: t("duplicate"), remove: t("remove"), drag: t("drag"), fixed: t("fixed") }}
          slots={
            props.slots
              ? {
                  label: props.slots.dragging ? t("slotDrop") : t("slot"),
                  inCells: props.slots.inCells,
                  onPlace: props.slots.onPlace,
                  onCancel: props.slots.onCancel,
                  describe: (at) => {
                    if ("rowId" in at) {
                      const row = measured.rows.find((r) => r.id === at.rowId);
                      return t.markup("slotCell", { column: String(at.column + 1), label: row?.label ?? "", bdi: (chunks) => chunks });
                    }
                    const before = measured.rows[at.index];
                    return before ? t.markup("slotBefore", { label: before.label, bdi: (chunks) => chunks }) : t("slotEnd");
                  },
                }
              : null
          }
          onRowDragStart={(id) => props.onRowDragStart(id)}
          onDropAt={(at) => props.onDropAt(at)}
        >
          {hydrated ? (
            <form ref={form} method="post" action="/api/admin/emails/preview" target={frameName} className="hidden">
              <input type="hidden" name="key" value={messageKey} readOnly />
              <input type="hidden" name="subject" value={subject} readOnly />
              <input type="hidden" name="body" value="" readOnly />
              <input type="hidden" name="blocks" value={documentJson} readOnly />
              <input type="hidden" name="mode" value="html" readOnly />
              <input type="hidden" name="editor" value="1" readOnly />
              {/* Each binding as the token the board draws — «{المكان}», braces and all; the renderer isolates it
                  (FSI … PDI) with the braces inside the isolate, as it isolates every bound value. */}
              <input type="hidden" name="tokens" value={JSON.stringify(Object.fromEntries(tokens))} readOnly />
            </form>
          ) : null}
          {hydrated ? (
            <iframe
              ref={frame}
              name={frameName}
              title={t("frameTitle")}
              // Same-origin so the editor can read where each row is; no `allow-scripts`, so nothing in the mail runs. The
              // route's own CSP says the same (`EDITOR_CSP`).
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              loading="eager"
              onLoad={measure}
              className="block border-0 bg-canvas"
              style={{ width, height: measured.height }}
            />
          ) : (
            <div className="bg-canvas" style={{ width, height: measured.height }} />
          )}

          {selectedBox && textual && !editing ? (
            <FloatingToolbar label={t("toolbar")} anchor={selectedBox}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(textual.id)}>
                {t("editText")}
              </Button>
              {(["start", "center", "end"] as const).map((value) => (
                <Button key={value} type="button" variant={align === value ? "secondary" : "ghost"} size="sm" aria-pressed={align === value} onClick={() => props.onAlign(textual.id, value)}>
                  {tb(value === "start" ? "alignStart" : value === "center" ? "alignCenter" : "alignEnd")}
                </Button>
              ))}
            </FloatingToolbar>
          ) : null}

          {editing && selectedBox && textual && textual.id === editing ? (
            <InlineEditor
              key={editing}
              box={selectedBox}
              label={t("editText")}
              value={toDisplay(textual.text, tokens)}
              onDone={(display) => {
                setEditing(null);
                const stored = toStored(display, tokens);
                if (stored !== textual.text) props.onEditText(textual.id, stored);
              }}
            />
          ) : null}
        </BlockCanvas>
      )}
    </CanvasStage>
  );
}

/** The words of one text block, edited where they sit. Commits on blur; Escape gives them back unchanged. */
function InlineEditor({ box, label, value, onDone }: { box: BlockCanvasBox; label: string; value: string; onDone: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // The person asked for this field by pressing «حرّر النص», so focus moving into it is theirs.
    ref.current?.focus();
  }, []);
  return (
    <Textarea
      ref={ref}
      rows={3}
      aria-label={label}
      value={draft}
      dir="rtl"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone(value);
      }}
      // PHYSICAL left/top from the frame's geometry (DEC-096's exemption).
      style={{ left: box.left, top: box.top, width: box.width, height: Math.max(box.height, 48) }}
      className="absolute z-30 resize-none border-2 border-accent leading-[1.7]"
    />
  );
}
