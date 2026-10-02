# m10c/ — the artboards behind docs/design/screens/M10c.md

Rows G and H of the design canvas «كريم معرفة · M10a + M10b + M10c — Member screens». Same conventions
as `m10a/` and `m10b/`: self-contained HTML (ignore the `support.js` line), 390 wide for phone, 1280 for
desktop, a tall board is the whole page, a bottom bar drawn at the bottom is fixed in the product.

| file | screen |
|---|---|
| Me.dc.html · MeEdit.dc.html | SCR-021 حسابي — ملفي in read mode (default) · in edit mode |
| Points.dc.html | SCR-022 نقاطي — ledger and catalogue |
| Certificates.dc.html | SCR-023 شهاداتي |
| Bookmarks.dc.html | SCR-024 المحفوظات |
| Calendar.dc.html | SCR-025 التقويم, connected |
| Notifications.dc.html | SCR-026 الإشعارات — inbox only |
| Settings.dc.html | SCR-029 الإعدادات — new route: notifications (master + optional), calendar link, visibility, language, privacy |
| Board.dc.html | SCR-027 لوحات الصدارة, the weekly window |
| Companies.dc.html | SCR-028 سباق الشركات |
| HubDesktop.dc.html | SCR-021/022 on desktop — the hub frame with نقاطي as a table |

References for layout, sizes and copy; nothing in them is a component (`docs/design/README.md`).
`png/` takes one export per board from the canvas (Share › Export), named after its file.
