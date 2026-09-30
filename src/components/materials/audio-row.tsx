"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";

// The audio row — REQ-MAT-007: «Audio gets an in-page player… keyboard operable and shows elapsed and total
// duration». `EventDone.dc.html:72`, DEC-209. No dependency: a native `<audio>` with no `controls`, driven by
// one button and one native range input.
//
// ★ The source is a signed URL the server hands only to a viewer who may fetch the file (`0116`): a caller
// that got null draws no player at all (`list.tsx`), so this never meets a member it must refuse.
// ★ Playing is a preview, not a download (DEC-178): nothing is audited here.
// ★ The scrubber is an `<input type="range">`: arrows, Page Up/Down, Home and End come from the platform,
// and `aria-valuetext` reads «12:03 من 58:12». The times are Western digits in an LTR run (DEC-124).
// ★ One recording at a time on a page: starting this one pauses any other.
// ★ The button draws `PlayIcon` or `PauseIcon`; its name says which, in words.

let current: HTMLAudioElement | null = null;

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—:—";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export interface AudioRowProps {
  src: string;
  title: string;
  /** «للاستماع فقط» or «للاستماع والتحميل» — the row's second line, after the duration. */
  note: string;
  /** Plain strings — a Server Component hands these across the boundary, so no function (DEC-159). The
   *  scrubber's «12:03 من 58:12» is read here, from `materials.list.audio.position`, as it changes. */
  labels: { play: string; pause: string; seek: string };
}

export function AudioRow({ src, title, note, labels }: AudioRowProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState<number>(Number.NaN);
  const titleId = useId();
  const t = useTranslations("materials.list.audio");

  useEffect(() => {
    const node = audio.current;
    return () => {
      if (node && current === node) current = null;
    };
  }, []);

  function toggle() {
    const node = audio.current;
    if (!node) return;
    if (node.paused) {
      if (current && current !== node) current.pause();
      current = node;
      void node.play().catch(() => setPlaying(false));
    } else {
      node.pause();
    }
  }

  function seek(event: ChangeEvent<HTMLInputElement>) {
    const node = audio.current;
    if (!node) return;
    node.currentTime = Number(event.target.value);
    setElapsed(node.currentTime);
  }

  const known = Number.isFinite(total) && total > 0;
  // An attribute carries plain text: the catalogue's <bdi> is dropped here, and the values are Western digits.
  const position = t.markup("position", { elapsed: clock(elapsed), total: clock(total), bdi: (chunks) => chunks });

  return (
    <div className="flex items-center gap-3 rounded-tile border border-edge bg-surface px-3.5 py-3">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setTotal(e.currentTarget.duration)}
        onDurationChange={(e) => setTotal(e.currentTarget.duration)}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? labels.pause : labels.play}
        aria-describedby={titleId}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-accent text-on-accent"
      >
        {playing ? <PauseIcon className="text-lg" /> : <PlayIcon className="text-lg" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p id={titleId} className="text-label font-bold text-fg-heading">
          <bdi>{title}</bdi>
        </p>
        <p className="text-caption text-fg-muted">
          <bdi dir="ltr" className="tabular-nums">
            {known ? clock(total) : "—:—"}
          </bdi>
          <span aria-hidden> · </span>
          {note}
        </p>
        {/* ui-lint-disable-next-line field — the player's scrubber: the system has no slider primitive, and a native range IS the keyboard-operable control REQ-MAT-007 asks for; named by aria-label, valued by aria-valuetext (approved by the lead in writing, wave 18 PR B, DEC-211) */}
        <input
          type="range"
          min={0}
          max={known ? total : 0}
          step={1}
          value={Math.min(elapsed, known ? total : 0)}
          onChange={seek}
          disabled={!known}
          aria-label={labels.seek}
          aria-valuetext={position}
          className="w-full accent-accent disabled:opacity-45"
        />
        <p className="text-caption text-fg-muted" aria-hidden>
          <bdi dir="ltr" className="tabular-nums">
            {clock(elapsed)} / {known ? clock(total) : "—:—"}
          </bdi>
        </p>
      </div>
    </div>
  );
}
