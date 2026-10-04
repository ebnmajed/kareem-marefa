"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { PreviewSession } from "@/lib/dal/notifications";

// «معاينة واختبار» — wave 23, REQ-UIX-112, REQ-NTF-010, REQ-NTF-011, DEC-161, DEC-238 §4.
//
// ★ THE ONE RENDERER, WITH A REAL SESSION. The frame is the same route the canvas uses, asked for the org's real session
// (`preview_card_session()` picks it; its words come through `session_public_card()`), so the admin reads a mail about
// something that exists. The test send reads the same two functions in the worker, so what arrives in Outlook is what
// was shown — and the sheet NAMES the session, or says it is sample data.
//
// ★ THE TEST GOES TO THE ADMIN'S OWN ADDRESS AND NO OTHER — `send_test_email()` takes no recipient. And it waits while
// anything is unsaved (#55's rule, kept): the job renders the SAVED row, so a test of an unsaved draft would mail a
// different message from the one on screen. It waits while a check blocks, for the same reason.
//
// Four modes, as wave 10 built them: phone 375, desktop 640, the text part, and forced dark — the one mode that is not
// the bytes that ship, and says so. A form posting into a named sandboxed frame; never `srcdoc`; no timer.

export type PreviewMode = "phone" | "desktop" | "text" | "dark";
const MODES: { mode: PreviewMode; width: number | null }[] = [
  { mode: "phone", width: 375 },
  { mode: "desktop", width: 640 },
  { mode: "text", width: null },
  { mode: "dark", width: 375 },
];

export interface PreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageKey: string;
  subject: string;
  documentJson: string;
  session: PreviewSession | null;
  /** The signed-in admin's own address — the only one a test reaches. */
  email: string | null;
  unsaved: boolean;
  blocked: boolean;
  sendTest: () => Promise<{ status: string; retryAfterMinutes?: number }>;
}

export function PreviewSheet({ open, onOpenChange, messageKey, subject, documentJson, session, email, unsaved, blocked, sendTest }: PreviewSheetProps) {
  const t = useTranslations("notifications.admin.emails.builder.previewSheet");
  const tp = useTranslations("notifications.admin.emails.preview");
  const td = useTranslations("notifications.admin.emails.design");
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<PreviewMode>("phone");
  const [testing, setTesting] = useState(false);
  const bdi = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

  useEffect(() => {
    if (open) form.current?.requestSubmit();
  }, [open, mode, documentJson]);

  const current = MODES.find((m) => m.mode === mode) ?? MODES[0]!;
  const disabled = unsaved || blocked || testing;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("title")} side="inline-end">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-fg-muted">{session ? t.rich("session", { title: session.title, bdi }) : t("sample")}</p>

        <div role="radiogroup" aria-label={tp("modesLabel")} className="flex flex-wrap gap-2">
          {MODES.map(({ mode: value }) => (
            <Button key={value} type="button" role="radio" aria-checked={mode === value} variant={mode === value ? "secondary" : "ghost"} size="sm" onClick={() => setMode(value)}>
              {tp(`mode.${value}`)}
            </Button>
          ))}
        </div>
        {mode === "dark" ? <p className="max-w-prose text-body-sm text-fg-muted">{tp("darkNote")}</p> : null}

        <form ref={form} method="post" action="/api/admin/emails/preview" target="mail-preview">
          <input type="hidden" name="key" value={messageKey} readOnly />
          <input type="hidden" name="subject" value={subject} readOnly />
          <input type="hidden" name="body" value="" readOnly />
          <input type="hidden" name="blocks" value={documentJson} readOnly />
          <input type="hidden" name="mode" value={mode === "text" ? "text" : "html"} readOnly />
          <input type="hidden" name="simulate" value={mode === "dark" ? "dark" : ""} readOnly />
          <input type="hidden" name="session" value="real" readOnly />
          <Button type="submit" variant="ghost" size="sm">
            {tp("refresh")}
          </Button>
        </form>

        <div className="overflow-x-auto">
          <iframe
            name="mail-preview"
            title={tp("frameTitle")}
            sandbox=""
            referrerPolicy="no-referrer"
            loading="eager"
            className="block h-[32rem] rounded-panel border border-edge bg-canvas"
            style={{ width: current.width ? `${current.width}px` : "100%", maxWidth: "100%" }}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-edge pt-4">
          <Button
            type="button"
            variant="primary"
            disabled={disabled}
            onClick={async () => {
              setTesting(true);
              try {
                const result = await sendTest();
                toast.show(
                  result.status === "queued"
                    ? { title: td("testSent"), tone: "success" }
                    : result.status === "rate_limited"
                      ? { title: td("testRateLimited"), tone: "error" }
                      : { title: td("errors.notPermitted"), tone: "error" },
                );
              } finally {
                setTesting(false);
              }
            }}
          >
            {email ? t.rich("send", { email, bdi: (chunks) => <bdi dir="ltr">{chunks}</bdi> }) : t("sendMine")}
          </Button>
          {unsaved ? <p className="text-body-sm text-fg-muted">{td("testNeedsSave")}</p> : blocked ? <p className="text-body-sm text-fg-muted">{t("blocked")}</p> : null}
        </div>
      </div>
    </Sheet>
  );
}
