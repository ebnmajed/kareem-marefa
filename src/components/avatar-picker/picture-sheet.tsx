"use client";

import { useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { formatNumber } from "@/components/sessions/numerals";
import { avatarLibrarySrc, type AvatarKey, type AvatarSet } from "@/lib/avatar-library";
import { CropStep } from "./crop-step";
import { LibraryGrid, setOf } from "./library-grid";
import { MAX_SOURCE_BYTES, MAX_SOURCE_MB } from "./upload";
import { useMinWidthLg } from "./use-min-width-lg";
import type { PictureChoice, PictureMember, PictureSaveResult, PictureSheetData } from "./types";

// The sheet «صورتك» (REQ-PRF-016 … 019, AVA-04 … 12, DEC-280, DEC-281; `AvatarPicker.dc.html`,
// `AvatarPickerPhoto.dc.html`, `AvatarCrop.dc.html`). The only place a member's picture changes.
//
// From the top: the picture at 80 px in the team ring with «صورتك» beside it and «أزل الصورة» under it while a photo is
// current · «ارفع صورة» · «من Google» while Google gave a picture · the chips over one grid · «حفظ». WHAT CANNOT APPLY IS
// ABSENT (AVA-05): no disabled control, no explanation.
//
// ★ A PICK, A REMOVAL OR «من Google» IS STAGED and committed by «حفظ»; closing without it changes nothing. The ring
// shows a staged library avatar at once; ★ it never previews Google's picture — that would be the hotlink DEC-099
// forbids (DEC-281 §7) — so «من Google» is marked pressed and the ring changes when the copy lands.
//
// ★ An upload is the exception the artboard draws: the crop's «حفظ» sends it and closes the whole flow when the
// worker answers (AVA-06). The ring and the shell move only when the version does — never an optimistic preview.
//
// A bottom `ui/sheet` on the phone; from `lg` the same body centred in `ui/dialog` (DEC-281). No motion of its own:
// the sheet's landing is PR C's (contract 4).

/** iOS refuses canvases over ~16.7 Mpx; 1024 px output never needs more than this. */
const DECODE_MAX = 4096;

type Staged = PictureChoice | null;
type PickError = "type" | "size" | null;

export interface PictureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: PictureSheetData;
  member: PictureMember;
  /** The Server Action «حفظ» calls (`savePicture`, bound to the locale). */
  save: (choice: PictureChoice) => Promise<PictureSaveResult>;
  /** A choice was committed (`google` waits for the copy) or an upload landed. */
  onSaved: (kind: PictureChoice["kind"] | "upload") => void;
}

/** Decodes the chosen file upright, capped at 4096 px on its long side. Throws when it is not a picture. */
async function decode(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= DECODE_MAX) return bitmap;
  const ratio = DECODE_MAX / long;
  const resized = await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * ratio), resizeHeight: Math.round(bitmap.height * ratio), resizeQuality: "high" });
  bitmap.close();
  return resized;
}

function Refusal({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-1.5 text-caption font-bold text-error">
      <AlertCircleIcon />
      <span>{children}</span>
    </p>
  );
}

export function PictureSheet({ open, onOpenChange, sheet, member, save, onSaved }: PictureSheetProps) {
  const t = useTranslations("profile.picture");
  const tProfile = useTranslations("profile");
  const tDialog = useTranslations("ui.dialog");
  const desktop = useMinWidthLg();
  const file = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged>(null);
  const [set, setSet] = useState<AvatarSet>(sheet.key ? setOf(sheet.key) : "characters");
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [pickError, setPickError] = useState<PickError>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  // Closing discards everything staged: reopening starts from the server's state.
  const reset = () => {
    setStaged(null);
    setSet(sheet.key ? setOf(sheet.key) : "characters");
    bitmap?.close();
    setBitmap(null);
    setPickError(null);
    setSaveFailed(false);
  };
  const changeOpen = (next: boolean) => {
    if (!next) {
      if (pending) return;
      reset();
    }
    onOpenChange(next);
  };

  const photoCurrent = sheet.source !== null;
  const ringSrc = (() => {
    if (staged?.kind === "library") return avatarLibrarySrc(staged.key);
    if (staged?.kind === "remove") return sheet.key ? avatarLibrarySrc(sheet.key) : null;
    return sheet.href;
  })();
  const outlined: AvatarKey | null = staged?.kind === "library" ? staged.key : staged?.kind === "remove" ? sheet.key : staged === null && !photoCurrent ? sheet.key : null;

  const pick = (key: AvatarKey) => {
    setSaveFailed(false);
    // A tap on the held key while no photo is current stages nothing: there is nothing to change.
    setStaged(key === sheet.key && !photoCurrent ? null : key === sheet.key && photoCurrent ? { kind: "remove" } : { kind: "library", key });
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = ""; // the same file can be chosen again after a refusal
    if (!chosen) return;
    setPickError(null);
    if (chosen.type !== "image/png" && chosen.type !== "image/jpeg") return setPickError("type");
    if (chosen.size > MAX_SOURCE_BYTES) return setPickError("size");
    try {
      setBitmap(await decode(chosen));
    } catch {
      setPickError("type");
    }
  };

  const commit = () => {
    if (!staged) return changeOpen(false);
    const choice = staged;
    setSaveFailed(false);
    startTransition(async () => {
      const result = await save(choice);
      if (result.status === "ok") {
        reset();
        onOpenChange(false);
        onSaved(choice.kind);
      } else {
        setSaveFailed(true);
      }
    });
  };

  const typeWord = t.rich("errors.type", { ltr: (c) => <bdi dir="ltr">{c}</bdi> });
  const sizeWord = t.rich("errors.size", { size: formatNumber(MAX_SOURCE_MB), bdi: (c) => <bdi>{c}</bdi> });

  const ring = <Avatar memberId={member.memberId} displayName={member.displayName} src={ringSrc} size={80} decorative teamColor={member.teamColor} />;
  const remove =
    photoCurrent && staged === null ? (
      <button type="button" onClick={() => setStaged({ kind: "remove" })} className="min-h-8 text-body-sm font-bold text-error">
        {t("remove")}
      </button>
    ) : null;

  const picker = (
    <div className="flex flex-col gap-3.5">
      <div className="flex gap-2.5">
        <Button type="button" size="lg" className="flex-1" onClick={() => file.current?.click()} disabled={pending}>
          {t("upload")}
        </Button>
        {sheet.googleAvailable ? (
          <Button
            type="button"
            variant="quiet"
            size="lg"
            aria-pressed={staged?.kind === "google"}
            onClick={() => setStaged(staged?.kind === "google" ? null : { kind: "google" })}
            className={staged?.kind === "google" ? "outline-3 outline-offset-2 outline-accent" : ""}
          >
            {t("google")}
          </Button>
        ) : null}
        {/* ui-lint-disable-next-line field — the hidden chooser behind «ارفع صورة»; the button names it (DEC-281). */}
        <input ref={file} type="file" accept="image/png,image/jpeg" hidden tabIndex={-1} aria-hidden="true" onChange={chooseFile} />
      </div>
      {pickError ? <Refusal>{pickError === "type" ? typeWord : sizeWord}</Refusal> : null}

      <LibraryGrid set={set} onSet={setSet} outlined={outlined} onPick={pick} />

      {saveFailed ? <Refusal>{t("errors.save")}</Refusal> : null}
      <Button type="button" variant="quiet" size="lg" className="w-full pg:bg-fg-heading pg:text-canvas" pending={pending} pendingLabel={tProfile("saving")} onClick={commit}>
        {tProfile("save")}
      </Button>
    </div>
  );

  const crop = bitmap ? (
    <CropStep
      bitmap={bitmap}
      onCancel={() => {
        bitmap.close();
        setBitmap(null);
      }}
      onDone={() => {
        reset();
        onOpenChange(false);
        onSaved("upload");
      }}
    />
  ) : null;

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent title={t("title")} closeLabel={tDialog("close")}>
          {crop ?? (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center gap-4">
                {ring}
                {remove}
              </div>
              {picker}
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen} title={t("title")} leading={crop ? undefined : ring} belowTitle={crop ? undefined : remove}>
      {crop ?? picker}
    </Sheet>
  );
}
