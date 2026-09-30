# m10a/ — the artboards behind docs/design/screens/M10a.md

One file per artboard, straight from the design canvas «كريم معرفة · M10a — Member screens».
Each is a self-contained HTML page: open it in a browser (the `<script src="./support.js">` line is the
canvas runtime and can be ignored — the page renders without it). Sizes are the board sizes: 390 wide
for phone, 1280 for desktop; tall boards are the whole page, and a bottom bar drawn at the bottom of a
tall board is a *fixed* bar in the product.

| file | screen |
|---|---|
| Main.dc.html | SCR-002 sign-in |
| ChooseOrg.dc.html | SCR-003 choose-org |
| NoAccess.dc.html | SCR-004 no-access |
| PublicCard.dc.html | SCR-007 public session card |
| Home.dc.html · HomeDesktop.dc.html | SCR-010 home, phone · desktop |
| Browse.dc.html | SCR-011 browse |
| Event.dc.html · EventLive.dc.html · EventDone.dc.html · EventDesktop.dc.html | SCR-012, published · live · completed · desktop |
| CheckIn.dc.html | SCR-014 check-in |
| Host.dc.html | SCR-016 host view |

These are references for layout, sizes and copy. Nothing in them is a component: no class name, id or
markup pattern from a `.dc.html` file appears in `src/` (`docs/design/README.md`). `png/` holds one
export per board from the canvas (Share › Export), for visual comparison during review.
