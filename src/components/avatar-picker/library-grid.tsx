"use client";

import { useTranslations } from "next-intl";
import { AVATAR_KEYS, AVATAR_SETS, avatarLibrarySrc, avatarNameKey, type AvatarKey, type AvatarSet } from "@/lib/avatar-library";

// The library in the sheet «صورتك» (REQ-PRF-016, AVA-10, AVA-11; `AvatarPicker.dc.html:103-104`): the chips
// شخصيات · أشياء over ONE grid that shows the chosen set and scrolls (DEC-281 §8). Five columns, 56 px avatars.
//
// ★ AN AVATAR CARRIES NO VISIBLE TEXT (AVA-11): each is a button named by its library name from `avatars.json`, with
// the shipped SVG as an `alt=""` image. The outlined key is `aria-pressed`, so the outline is never colour alone.

export function setOf(key: AvatarKey): AvatarSet {
  return key.startsWith("objects/") ? "objects" : "characters";
}

export interface LibraryGridProps {
  set: AvatarSet;
  onSet: (set: AvatarSet) => void;
  /** The key outlined, or null when a photo is current and nothing is staged. */
  outlined: AvatarKey | null;
  onPick: (key: AvatarKey) => void;
}

export function LibraryGrid({ set, onSet, outlined, onPick }: LibraryGridProps) {
  const t = useTranslations("profile.picture");
  const tNames = useTranslations("avatars.names");
  const keys = AVATAR_KEYS.filter((key) => setOf(key) === set);

  return (
    <div className="flex flex-col gap-3.5">
      <div role="group" aria-label={t("sets.label")} className="flex gap-2">
        {AVATAR_SETS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === set}
            onClick={() => onSet(s)}
            className={`min-h-9 rounded-pill px-4 text-caption font-bold ${s === set ? "bg-fg-heading text-canvas" : "bg-raised text-fg-heading"}`}
          >
            {t(`sets.${s}`)}
          </button>
        ))}
      </div>
      <ul aria-label={t("grid")} className="grid max-h-[280px] grid-cols-5 justify-items-center gap-2.5 overflow-y-auto p-1.5">
        {keys.map((key) => (
          <li key={key}>
            <button
              type="button"
              aria-label={tNames(avatarNameKey(key))}
              aria-pressed={key === outlined}
              onClick={() => onPick(key)}
              className={`block size-14 rounded-pill ${key === outlined ? "outline-3 outline-offset-3 outline-accent" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a shipped SVG at its own size; nothing to optimise. */}
              <img src={avatarLibrarySrc(key)} alt="" width={56} height={56} loading="lazy" decoding="async" className="size-14" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
