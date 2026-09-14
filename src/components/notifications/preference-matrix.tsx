import { getTranslations } from "next-intl/server";
import { savePreference } from "@/app/[locale]/app/me/notifications/actions";
import type { CategoryPreference } from "@/lib/dal/notifications";

// SCR-026's preference half (REQ-NTF-003): category × channel, and exactly
// two channels because there are only two (REQ-NTF-001).
//
// The three fixed categories of `08` §2 render as a STATEMENT with a reason,
// not as a disabled switch — `09` SCR-026: "fixed rows with a one-line
// explanation, not toggles that silently do nothing". A switchable category
// that still contains non-optional messages (`my_sessions` holds a
// cancellation) says so under the switch, because a setting that quietly has
// exceptions is worse than no setting.
//
// Each cell is its own form. No client JavaScript, no optimistic state to get
// wrong, and the whole screen works on a phone with a slow connection.

// `min-h-11` rather than `h-11`: «لا يُرسل على هذه القناة» wraps to two lines
// in a half-width cell at 390 px, and a fixed height would clip it — which
// 10 §2 forbids on a text line, because clipping is what eats tashkeel.
const cell = "flex min-h-11 w-full items-center justify-center rounded-field border px-2 py-2 text-center text-label transition-colors duration-150";

function Toggle({
  category,
  channel,
  enabled,
  label,
  on,
  off,
}: {
  category: string;
  channel: "in_app" | "email";
  enabled: boolean;
  label: string;
  on: string;
  off: string;
}) {
  return (
    <form action={savePreference}>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="channel" value={channel} />
      {/* The value being switched TO — a double submit lands on the same state. */}
      <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
      <button
        type="submit"
        aria-pressed={enabled}
        aria-label={`${label} — ${enabled ? on : off}`}
        className={`${cell} ${
          enabled
            ? "border-edge-strong bg-silver-100 text-fg-heading"
            : "border-edge text-fg-muted hover:border-edge-strong hover:text-fg-heading"
        }`}
      >
        {enabled ? on : off}
      </button>
    </form>
  );
}

export async function PreferenceMatrix({ rows }: { rows: CategoryPreference[] }) {
  const t = await getTranslations("notifications");
  const channels = [
    { id: "in_app" as const, key: "inApp" as const, label: t("preferences.channel.inApp") },
    { id: "email" as const, key: "email" as const, label: t("preferences.channel.email") },
  ];

  return (
    <ul className="mt-6 space-y-4">
      {rows.map((row) => (
        <li key={row.category} className="rounded-field border border-edge p-4">
          <h3 className="text-label text-fg-heading">{t(`category.${row.category}.name`)}</h3>
          <p className="mt-1 text-body-sm text-fg-muted">{t(`category.${row.category}.hint`)}</p>

          {row.switchable ? (
            <>
              {/* Two columns at EVERY width, not just from `sm`. Stacked, the
                  eleven categories make SCR-026 ten thousand pixels tall on a
                  phone; side by side the labels still fit in ~180 px. */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                {channels.map((channel) => (
                  <div key={channel.id}>
                    <span className="block text-body-sm text-fg-muted">{channel.label}</span>
                    <div className="mt-1">
                      {row.available[channel.key] ? (
                        <Toggle
                          category={row.category}
                          channel={channel.id}
                          enabled={row.enabled[channel.key]}
                          label={`${t(`category.${row.category}.name`)} — ${channel.label}`}
                          on={t("preferences.on")}
                          off={t("preferences.off")}
                        />
                      ) : (
                        <p className={`${cell} border-transparent text-fg-muted`}>{t("preferences.notAvailable")}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {row.alwaysOn.length > 0 ? (
                <p className="mt-3 text-body-sm text-fg-muted">
                  {t.rich("preferences.alwaysOn", {
                    list: row.alwaysOn.map((key) => t(`message.${key}`)).join("، "),
                    bdi: (chunks) => <bdi>{chunks}</bdi>,
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 rounded-field border border-edge-strong bg-silver-100 p-3 text-body-sm text-fg-heading">
              <strong className="text-label">{t("preferences.fixed")}</strong> — {t(`category.${row.category}.why`)}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
