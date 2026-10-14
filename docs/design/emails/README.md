# Kareem Marefa — notification emails

Seven templates, one shared shell. Dark-native, RTL, 600px, table layout with inline styles (Gmail, Apple Mail, Outlook incl. VML buttons).

| File | Trigger |
|---|---|
| new-session.html | Session published |
| booking-confirmed.html | Seat reserved |
| reminder-week.html / reminder-tomorrow.html | 7 days / 1 day before (`countdown` = "7 أيام" / "غدًا") |
| activity-comment.html | Comment on a session you present |
| weekly-leaderboard.html | Weekly leaderboard close |
| after-session.html | Check-in confirmed → points + certificate |

## Placeholders
All dynamic values are `{{snake_case}}`. Images must be absolute hosted URLs:
- `logo_url` → host `assets/logo-mark@2x.png` (rendered at 24×33; SVG is not supported by Gmail)
- `poster_url` → the session poster, 16:9, ≥1072px wide
- `qr_url` → check-in QR PNG, ≥176px
Western numerals throughout (DEC-124).

## Notes
- Font: Baloo Bhaijaan 2 via Google Fonts `<link>`; Apple Mail / iOS / Outlook.com render it, Gmail falls back to Segoe UI/Tahoma.
- `color-scheme: dark` is declared so clients don't invert the palette.
- The leaderboard top-3 rows are sample markup — loop them from data.
- Regenerate from `build.py` (source of truth) rather than hand-editing.
