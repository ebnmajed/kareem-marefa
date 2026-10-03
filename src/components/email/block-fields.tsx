"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PALETTE_TOKENS, type BlockStyle, type EmailBlock, type PaletteToken } from "@kareem/mail-runtime";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TagChip } from "@/components/ui/tag-chip";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toDisplay, toStored, type TokenMap } from "@/components/email/binding-labels";

// الكتلة — the selected block's content and style (wave 23, REQ-UIX-112, REQ-NTF-012, `AdminEmails.dc.html`).
//
// ★ A FIELD COMMITS ON BLUR, NOT ON EVERY KEY. The canvas is the one renderer's frame (REQ-NTF-010), refreshed on a
// change; refreshing it per keystroke would reload the mail under the admin's cursor, and a burst of typing is one
// undo step, not forty. The text a field SHOWS carries the Arabic tokens; what it commits carries the bindings.
//
// ★ VARIABLES ARE LISTED, NEVER TYPED (REQ-NTF-012). The chips are the bindings this message offers; a tap inserts
// one at the caret of the last text field touched. A button's and a QR's link is a `select` of the URL bindings.

const PADS = [0, 8, 16, 24] as const;

export interface BlockFieldsProps {
  block: EmailBlock;
  tokens: TokenMap;
  /** binding → «{label}», the chips, in order. */
  chips: readonly { binding: string; token: string }[];
  /** The URL bindings this message offers — a button's or a QR's link. */
  urlBindings: readonly string[];
  onChange: (block: EmailBlock) => void;
}

/** A text field that keeps what is typed and commits it on blur. Keyed by the stored value, so an undo resets it. */
function CommitText({
  label,
  value,
  multiline,
  tokens,
  onCommit,
  onFocusField,
  dir,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  tokens: TokenMap;
  onCommit: (stored: string) => void;
  onFocusField?: (el: HTMLInputElement | HTMLTextAreaElement, commit: (stored: string) => void) => void;
  dir?: "ltr";
}) {
  const [draft, setDraft] = useState(() => toDisplay(value, tokens));
  const commit = (display: string) => {
    const stored = toStored(display, tokens);
    if (stored !== value) onCommit(stored);
  };
  const common = {
    value: draft,
    dir,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => {
      onFocusField?.(e.target, (stored) => onCommit(stored));
      commit(e.target.value);
    },
  };
  return (
    <Field label={label}>
      {multiline ? <Textarea rows={4} className="leading-[1.7]" {...common} /> : <Input {...common} />}
    </Field>
  );
}

export function BlockFields({ block, tokens, chips, urlBindings, onChange }: BlockFieldsProps) {
  const t = useTranslations("notifications.admin.emails.builder.block");
  const tt = useTranslations("notifications.admin.emails.builder.tokens");
  const [tab, setTab] = useState("content");
  // The last text field touched and how to write into it — where a chip inserts.
  const last = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; commit: (stored: string) => void } | null>(null);
  const remember = (el: HTMLInputElement | HTMLTextAreaElement, commit: (stored: string) => void) => {
    last.current = { el, commit };
  };
  const patch = (next: Partial<EmailBlock>) => onChange({ ...block, ...next } as EmailBlock);
  const text = (key: string, label: string, value: string, set: (stored: string) => Partial<EmailBlock>, multiline = false) => (
    <CommitText key={`${block.id}-${key}-${value}`} label={label} value={value} multiline={multiline} tokens={tokens} onFocusField={remember} onCommit={(stored) => patch(set(stored))} />
  );

  const style: BlockStyle = (block.type === "button" ? block.blockStyle : "style" in block ? block.style : undefined) ?? {};
  const setStyle = (next: BlockStyle) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as BlockStyle;
    const value = Object.keys(clean).length > 0 ? clean : undefined;
    onChange((block.type === "button" ? { ...block, blockStyle: value } : { ...block, style: value }) as EmailBlock);
  };

  const select = (label: string, value: string, options: { value: string; label: string }[], set: (value: string) => void) => (
    <Field label={label}>
      <Select value={value} onChange={(e) => set(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  const align = select(
    t("align"),
    style.align ?? "start",
    [
      { value: "start", label: t("alignStart") },
      { value: "center", label: t("alignCenter") },
      { value: "end", label: t("alignEnd") },
    ],
    (value) => setStyle({ ...style, align: value === "start" ? undefined : (value as BlockStyle["align"]) }),
  );
  const urlSelect = (value: string, set: (binding: string) => void) =>
    select(t("link"), value, [{ value: "", label: "—" }, ...urlBindings.map((binding) => ({ value: binding, label: tokens.get(binding) ?? binding }))], set);

  let content: ReactNode;
  switch (block.type) {
    case "heading":
    case "paragraph":
      content = (
        <>
          {select(
            t("level"),
            block.type === "paragraph" ? "p" : String(block.level),
            [
              { value: "p", label: t("levelParagraph") },
              { value: "1", label: t("levelH1") },
              { value: "2", label: t("levelH2") },
            ],
            (value) =>
              onChange(
                value === "p"
                  ? { type: "paragraph", id: block.id, text: block.text, ...(block.style ? { style: block.style } : {}) }
                  : { type: "heading", id: block.id, text: block.text, level: value === "1" ? 1 : 2, ...(block.style ? { style: block.style } : {}) },
              ),
          )}
          {text("text", t("text"), block.text, (stored) => ({ text: stored }), true)}
        </>
      );
      break;
    case "button":
      content = (
        <>
          {text("label", t("label"), block.label, (stored) => ({ label: stored }))}
          {urlSelect(block.urlBinding, (binding) => patch({ urlBinding: binding }))}
          {select(t("buttonStyle"), block.style, [
            { value: "primary", label: t("primary") },
            { value: "secondary", label: t("secondary") },
          ], (value) => patch({ style: value as "primary" | "secondary" }))}
        </>
      );
      break;
    case "image":
      content = (
        <>
          {select(t("source"), block.src.kind, [
            { value: "org_logo", label: t("sourceLogo") },
            { value: "session_card_image", label: t("sourceSession") },
          ], (value) => patch({ src: { kind: value as "org_logo" | "session_card_image" } }))}
          {text("alt", t("alt"), block.alt, (stored) => ({ alt: stored }))}
        </>
      );
      break;
    case "session_card":
      content = <Switch label={t("withImage")} checked={block.withImage === true} onCheckedChange={(checked) => patch({ withImage: checked })} />;
      break;
    case "spacer":
      content = select(t("height"), block.height, [
        { value: "sm", label: t("sm") },
        { value: "md", label: t("md") },
        { value: "lg", label: t("lg") },
      ], (value) => patch({ height: value as "sm" | "md" | "lg" }));
      break;
    case "poster":
      content = text("alt", t("alt"), block.alt, (stored) => ({ alt: stored }));
      break;
    case "qr":
      content = (
        <>
          {urlSelect(block.urlBinding, (binding) => patch({ urlBinding: binding }))}
          {text("label", t("qrCaption"), block.label, (stored) => ({ label: stored }))}
          {text("alt", t("alt"), block.alt, (stored) => ({ alt: stored }))}
          {select(t("qrSize"), block.size, [
            { value: "sm", label: t("sm") },
            { value: "md", label: t("md") },
          ], (value) => patch({ size: value as "sm" | "md" }))}
        </>
      );
      break;
    case "logo":
      content = select(t("width"), String(block.width), ["96", "120", "160", "200", "240"].map((value) => ({ value, label: value })), (value) => patch({ width: Number(value) }));
      break;
    case "certificate":
      content = text("label", t("label"), block.label, (stored) => ({ label: stored }));
      break;
    case "detail_list":
    case "social": {
      const items = block.items;
      const labelOf = block.type === "social" ? [t("itemLabel"), t("itemValue")] : [t("detailLabel"), t("detailValue")];
      content = (
        <>
          {items.map((item, index) => (
            <fieldset key={`${block.id}-${index}`} className="flex flex-col gap-2 rounded-panel border border-edge p-2">
              {text(`l${index}`, labelOf[0]!, item.label, (stored) => ({ items: items.map((it, i) => (i === index ? { ...it, label: stored } : it)) }))}
              {block.type === "social" ? (
                <CommitText
                  key={`${block.id}-v${index}-${item.value}`}
                  label={labelOf[1]!}
                  value={item.value}
                  tokens={new Map()}
                  dir="ltr"
                  onCommit={(stored) => patch({ items: items.map((it, i) => (i === index ? { ...it, value: stored } : it)) })}
                />
              ) : (
                text(`v${index}`, labelOf[1]!, item.value, (stored) => ({ items: items.map((it, i) => (i === index ? { ...it, value: stored } : it)) }))
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => patch({ items: items.filter((_, i) => i !== index) })}>
                {t("removeLink")}
              </Button>
            </fieldset>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => patch({ items: [...items, { label: "", value: "" }] })}>
            {block.type === "social" ? t("addLink") : t("addRow")}
          </Button>
        </>
      );
      break;
    }
    default:
      content = <p className="text-body-sm text-fg-muted">{t("noFields")}</p>;
  }

  const tokenOptions = [{ value: "", label: t("default") }, ...PALETTE_TOKENS.map((token) => ({ value: token, label: tt(token) }))];
  const styleTab = (
    <>
      {block.type !== "spacer" && block.type !== "divider" ? align : null}
      {block.type !== "spacer"
        ? (["padTop", "padBottom"] as const).map((side) =>
            select(t(side), String(style[side] ?? ""), [{ value: "", label: t("default") }, ...PADS.map((pad) => ({ value: String(pad), label: String(pad) }))], (value) =>
              setStyle({ ...style, [side]: value === "" ? undefined : (Number(value) as 0 | 8 | 16 | 24) }),
            ),
          )
        : null}
      {block.type === "heading" || block.type === "paragraph" || block.type === "social" || block.type === "logo"
        ? select(t("colour"), style.colour ?? "", tokenOptions, (value) => setStyle({ ...style, colour: value === "" ? undefined : (value as PaletteToken) }))
        : null}
      {block.type === "button"
        ? select(t("background"), style.background ?? "", tokenOptions, (value) => setStyle({ ...style, background: value === "" ? undefined : (value as PaletteToken) }))
        : null}
      {block.type === "button" || block.type === "certificate"
        ? select(t("shape"), style.shape ?? "", [
            { value: "", label: t("default") },
            { value: "rounded", label: t("rounded") },
            { value: "pill", label: t("pill") },
          ], (value) => setStyle({ ...style, shape: value === "" ? undefined : (value as "rounded" | "pill") }))
        : null}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        label={t("tabContent")}
        items={[
          { value: "content", label: t("tabContent") },
          { value: "style", label: t("tabStyle") },
        ]}
        value={tab}
        onValueChange={setTab}
      >
        <div className="flex flex-col gap-3 pt-3">{tab === "content" ? content : styleTab}</div>
      </Tabs>

      {tab === "content" && chips.length > 0 && hasText(block) ? (
        <section aria-labelledby={`vars-${block.id}`} className="flex flex-col gap-2">
          <h3 id={`vars-${block.id}`} className="text-caption font-bold text-fg-muted">
            {t("variables")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.binding}
                type="button"
                onClick={() => {
                  const field = last.current;
                  if (!field) return;
                  const { el, commit } = field;
                  const start = el.selectionStart ?? el.value.length;
                  const end = el.selectionEnd ?? start;
                  commit(toStored(el.value.slice(0, start) + chip.token + el.value.slice(end), tokens));
                }}
                className="rounded-pill"
              >
                <TagChip label={chip.token} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="border-t border-edge pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setStyle({})}>
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}

function hasText(block: EmailBlock): boolean {
  return ["heading", "paragraph", "button", "image", "poster", "qr", "certificate", "detail_list", "social"].includes(block.type);
}
