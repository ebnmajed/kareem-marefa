# m11a/ — the artboards behind docs/design/screens/M11a.md

Row I of the design canvas. Self-contained HTML (ignore the `support.js` line); 1280 wide for the
console, 390 for the phone stack.

| file | screen |
|---|---|
| AdminDashboard.dc.html | SCR-040 لوحة المؤسسة |
| AdminProposals.dc.html | SCR-041 المقترحات — split view |
| AdminSessions.dc.html · AdminSessionsPhone.dc.html | SCR-042 الجلسات — table · phone stack |
| AdminSessionHub.dc.html | SCR-043 إعدادات الجلسة — الجدولة, read mode |
| AdminAttendance.dc.html | SCR-044 إعدادات الجلسة — الحضور, live |

Nothing in them is a component. `png/` takes one export per board (Share › Export), named after its file.
