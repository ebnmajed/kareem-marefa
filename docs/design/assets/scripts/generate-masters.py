"""Generate the كريم معرفة asset masters (SVG) from the instanced Baloo Bhaijaan 2 fonts.

Outputs (under OUT):
  brand/wordmark-ar-{ink,lime,bone}.svg   the Arabic wordmark as outlines (font independent)
  brand/mark.svg                           app icon mark: lime rounded square + isolated kaf
  objects/svg/{coin,cup,flame,ticket,star,rocket}.svg
Text inside objects ("+50", "محجوز") is converted to paths so rasterisers need no fonts.
"""
import os, math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

OUT = os.environ.get('OUT', '/tmp/assets-work/out')
AR = '/tmp/assets-work/baloo-ar-800.ttf'
LAT = '/tmp/assets-work/baloo-lat-800.ttf'

INK, LIME, BONE, CORAL = '#0B0C12', '#C6FF3D', '#F4F1EA', '#FF6E4F'

def ensure(p):
    os.makedirs(os.path.dirname(p), exist_ok=True)

def shape(text, ttf_path, features=None):
    """Return (list of (glyphname, x, y) placements, total advance, ascender, descender) in font units."""
    ttf = TTFont(ttf_path)
    blob = hb.Blob.from_file_path(ttf_path); face = hb.Face(blob); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, features or {"kern": True, "liga": True, "rlig": True, "calt": True})
    x = 0; placed = []
    for gi, gp in zip(buf.glyph_infos, buf.glyph_positions):
        placed.append((ttf.getGlyphName(gi.codepoint), x + gp.x_offset, gp.y_offset))
        x += gp.x_advance
    hhea = ttf['hhea']
    return ttf, placed, x, hhea.ascent, hhea.descent

def text_path(text, ttf_path, scale=1.0, dx=0.0, dy=0.0, features=None):
    """SVG path data for text, drawn left-to-right in visual order, baseline at dy, scaled."""
    ttf, placed, adv, asc, desc = shape(text, ttf_path, features)
    gs = ttf.getGlyphSet()
    pen = SVGPathPen(gs)
    for name, x, y in placed:
        tpen = TransformPen(pen, (scale, 0, 0, -scale, dx + x * scale, dy - y * scale))
        gs[name].draw(tpen)
    return pen.getCommands(), adv * scale, asc * scale, desc * scale

def text_bounds(text, ttf_path, scale=1.0, dx=0.0, dy=0.0):
    from fontTools.pens.boundsPen import BoundsPen
    ttf, placed, adv, asc, desc = shape(text, ttf_path)
    gs = ttf.getGlyphSet(); bp = BoundsPen(gs)
    for name, x, y in placed:
        gs[name].draw(TransformPen(bp, (scale, 0, 0, -scale, dx + x * scale, dy - y * scale)))
    return bp.bounds  # (xmin, ymin, xmax, ymax) in SVG space

def svg(w, h, body, extra_attrs=''):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" width="%g" height="%g"%s>%s</svg>'
            % (w, h, w, h, extra_attrs, body))

def write(p, s):
    ensure(p); open(p, 'w', encoding='utf-8').write(s)

# ---------------- brand: wordmark ----------------
b = text_bounds('كريم معرفة', AR, 1.0, 0, 0)
gh = b[3] - b[1]; margin = gh * 0.14
W = (b[2] - b[0]) + margin * 2; H = gh + margin * 2
d, _, _, _ = text_path('كريم معرفة', AR, scale=1.0, dx=margin - b[0], dy=margin - b[1])
for name, color in (('ink', INK), ('lime', LIME), ('bone', BONE)):
    body = '<title>كريم معرفة</title><path fill="%s" d="%s"/>' % (color, d)
    write(f'{OUT}/brand/wordmark-ar-{name}.svg', svg(round(W), round(H), body, ' role="img" aria-label="كريم معرفة"'))
print('wordmark', round(W), round(H))

# lockup with "by Peninsula" line is composed in the app from tokens; only the mark and wordmark ship.

# ---------------- brand: mark (app icon) ----------------
S = 1024
kb = text_bounds('ك', AR, 1.0, 0, 0)
kw, kh = kb[2] - kb[0], kb[3] - kb[1]
sc = (S * 0.58) / max(kw, kh)
kb = text_bounds('ك', AR, sc, 0, 0)
gx = (S - (kb[2] - kb[0])) / 2 - kb[0]
gy = (S - (kb[3] - kb[1])) / 2 - kb[1]
kd, _, _, _ = text_path('ك', AR, scale=sc, dx=gx, dy=gy)
mark_body = ('<rect width="%d" height="%d" rx="%d" fill="%s"/>'
             '<path fill="%s" d="%s"/>') % (S, S, int(S * 0.22), LIME, INK, kd)
write(f'{OUT}/brand/mark.svg', svg(S, S, mark_body, ' role="img" aria-label="كريم معرفة"'))
# monochrome variants for the favicon and dark/light chrome
write(f'{OUT}/brand/mark-mono-ink.svg', svg(S, S, '<rect width="%d" height="%d" rx="%d" fill="%s"/><path fill="%s" d="%s"/>' % (S, S, int(S*0.22), INK, LIME, kd)))
print('mark ok')

# ---------------- objects ----------------
def shadow(cx=84, cy=146, rx=52, ry=8):
    return '<g id="shadow"><ellipse cx="%g" cy="%g" rx="%g" ry="%g" fill="#000000" opacity="0.45"/></g>' % (cx, cy, rx, ry)

# coin: "+50" as paths from the Latin instance
p50, adv50, asc50, desc50 = text_path('+50', LAT, scale=1.0)
sc50 = 60 / adv50  # ~60 units wide in the 160 box
p50, adv50, asc50, desc50 = text_path('+50', LAT, scale=sc50)
cap = asc50 * 0.72
p50, _, _, _ = text_path('+50', LAT, scale=sc50, dx=80 - adv50 / 2, dy=76 + cap / 2)
coin = svg(160, 160,
  '<defs>'
  '<radialGradient id="coin-face" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#EDFFA3"/><stop offset="0.55" stop-color="#C6FF3D"/><stop offset="1" stop-color="#78AD12"/></radialGradient>'
  '<linearGradient id="coin-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CCF29"/><stop offset="1" stop-color="#4F7A0C"/></linearGradient>'
  '</defs>' + shadow() +
  '<g id="object" transform="rotate(-12 80 80)">'
  '<circle cx="80" cy="86" r="52" fill="url(#coin-edge)"/>'
  '<circle cx="80" cy="76" r="52" fill="url(#coin-face)"/>'
  '<circle cx="80" cy="76" r="38" fill="none" stroke="#6E9E12" stroke-width="4" opacity="0.5"/>'
  '<path fill="%s" d="%s"/>'
  '<ellipse cx="60" cy="48" rx="18" ry="8" fill="#FFFFFF" opacity="0.55" transform="rotate(-30 60 48)"/>'
  '</g>' % (INK, p50))
write(f'{OUT}/objects/svg/coin.svg', coin)

cup = svg(160, 160,
  '<defs><radialGradient id="cup-body" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#FFF0A8"/><stop offset="0.5" stop-color="#FFD23F"/><stop offset="1" stop-color="#B8860B"/></radialGradient></defs>'
  + shadow(84, 146, 46, 8) +
  '<g id="object" transform="rotate(-10 80 80)">'
  '<path d="M40 28h80l-8 56a32 32 0 0 1-64 0z" fill="url(#cup-body)"/>'
  '<path d="M40 36c-18 0-24 10-18 22 5 10 15 15 26 15M120 36c18 0 24 10 18 22-5 10-15 15-26 15" fill="none" stroke="#B8860B" stroke-width="7" stroke-linecap="round"/>'
  '<rect x="70" y="112" width="20" height="14" fill="#B8860B"/>'
  '<rect x="52" y="124" width="56" height="14" rx="5" fill="#FFD23F"/>'
  '<path d="m80 52 5 10 11 1-8 8 2 11-10-5-10 5 2-11-8-8 11-1z" fill="#B8860B" opacity="0.6"/>'
  '<ellipse cx="58" cy="44" rx="12" ry="5" fill="#FFFFFF" opacity="0.6" transform="rotate(-25 58 44)"/>'
  '</g>')
write(f'{OUT}/objects/svg/cup.svg', cup)

flame = svg(160, 160,
  '<defs><radialGradient id="flame-body" cx="50%" cy="80%" r="70%"><stop offset="0" stop-color="#FFD23F"/><stop offset="0.5" stop-color="#FF6E4F"/><stop offset="1" stop-color="#B8321B"/></radialGradient>'
  '<clipPath id="flame-clip"><path d="M82 14c8 34 44 44 44 88a44 44 0 0 1-88 0c0-18 10-28 20-38 0 18 8 28 18 28 0-28-10-52 6-78z"/></clipPath></defs>'
  + shadow(82, 146, 40, 8) +
  '<g id="object" transform="rotate(8 80 80)">'
  '<path d="M82 14c8 34 44 44 44 88a44 44 0 0 1-88 0c0-18 10-28 20-38 0 18 8 28 18 28 0-28-10-52 6-78z" fill="url(#flame-body)"/>'
  '<path d="M84 68c3 16 20 20 20 38a20 20 0 0 1-40 0c0-10 5-15 10-20 0 8 3 13 8 13 0-13-5-20 2-31z" fill="#FFF3C4" opacity="0.92"/>'
  '<g clip-path="url(#flame-clip)"><ellipse cx="58" cy="86" rx="6" ry="13" fill="#FFFFFF" opacity="0.4" transform="rotate(18 58 86)"/></g>'
  '</g>')
write(f'{OUT}/objects/svg/flame.svg', flame)

# ticket with "محجوز" as paths
pm, advm, ascm, descm = text_path('محجوز', AR, scale=1.0)
scm = 46 / advm
pm, advm, ascm, descm = text_path('محجوز', AR, scale=scm)
pm, _, _, _ = text_path('محجوز', AR, scale=scm, dx=58 - advm / 2, dy=88)
# body with notches: rounded rect minus two circles (evenodd)
ticket_body = ('M36 44h88a14 14 0 0 1 14 14v44a14 14 0 0 1-14 14H36a14 14 0 0 1-14-14V58a14 14 0 0 1 14-14z '
               'M22 80a9 9 0 1 0 18 0a9 9 0 1 0-18 0z M120 80a9 9 0 1 0 18 0a9 9 0 1 0-18 0z')
ticket = svg(160, 160,
  '<defs><linearGradient id="ticket-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FE6FF"/><stop offset="0.5" stop-color="#35D0FF"/><stop offset="1" stop-color="#1281A8"/></linearGradient>'
  '<clipPath id="ticket-clip"><path d="M36 44h88a14 14 0 0 1 14 14v44a14 14 0 0 1-14 14H36a14 14 0 0 1-14-14V58a14 14 0 0 1 14-14z"/></clipPath></defs>'
  + shadow(84, 146, 50, 8) +
  '<g id="object" transform="rotate(-14 80 80)">'
  '<path d="%s" fill="url(#ticket-body)" fill-rule="evenodd"/>'
  '<path d="M96 52v56" stroke="#0B0C12" stroke-width="3" stroke-dasharray="4 6" opacity="0.6"/>'
  '<path fill="%s" d="%s"/>'
  '<rect x="99" y="52" width="22" height="22" rx="4" fill="#0B0C12" opacity="0.85"/>'
  '<rect x="103" y="56" width="5" height="5" fill="#35D0FF"/><rect x="112" y="56" width="5" height="5" fill="#35D0FF"/><rect x="103" y="65" width="5" height="5" fill="#35D0FF"/><rect x="112" y="65" width="5" height="5" fill="#35D0FF" opacity="0.5"/>'
  '<g clip-path="url(#ticket-clip)"><ellipse cx="50" cy="54" rx="16" ry="5" fill="#FFFFFF" opacity="0.5"/></g>'
  '</g>' % (ticket_body, INK, pm))
write(f'{OUT}/objects/svg/ticket.svg', ticket)

star = svg(160, 160,
  '<defs><radialGradient id="star-body" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#FFB3DE"/><stop offset="0.5" stop-color="#FF4FB8"/><stop offset="1" stop-color="#A81C74"/></radialGradient>'
  '<clipPath id="star-clip"><path d="m80 8 19 40 44 6-32 30 8 44-39-21-39 21 8-44-32-30 44-6z"/></clipPath></defs>'
  + shadow(82, 146, 44, 8) +
  '<g id="object" transform="rotate(-8 80 80)">'
  '<path d="m80 14 19 40 44 6-32 30 8 44-39-21-39 21 8-44-32-30 44-6z" fill="#A81C74"/>'
  '<path d="m80 8 19 40 44 6-32 30 8 44-39-21-39 21 8-44-32-30 44-6z" fill="url(#star-body)"/>'
  '<circle cx="80" cy="66" r="20" fill="#0B0C12" opacity="0.85"/>'
  '<path d="m71 66 6 6 12-13" fill="none" stroke="#FF4FB8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
  '<g clip-path="url(#star-clip)"><ellipse cx="70" cy="36" rx="12" ry="6" fill="#FFFFFF" opacity="0.5" transform="rotate(-35 70 36)"/></g>'
  '</g>')
write(f'{OUT}/objects/svg/star.svg', star)

rocket = svg(160, 160,
  '<defs><radialGradient id="rocket-body" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#D7CCFF"/><stop offset="0.5" stop-color="#9B7CFF"/><stop offset="1" stop-color="#4E35B8"/></radialGradient>'
  '<radialGradient id="rocket-flame" cx="50%" cy="20%" r="70%"><stop offset="0" stop-color="#FFD23F"/><stop offset="1" stop-color="#FF6E4F"/></radialGradient>'
  '<clipPath id="rocket-clip"><path d="M80 12c22 18 30 48 30 78H50c0-30 8-60 30-78z"/></clipPath></defs>'
  + shadow(84, 146, 40, 8) +
  '<g id="object" transform="rotate(-24 80 80)">'
  '<path d="M80 12c22 18 30 48 30 78H50c0-30 8-60 30-78z" fill="url(#rocket-body)"/>'
  '<path d="M50 78 32 104h22zM110 78l18 26h-22z" fill="#4E35B8"/>'
  '<rect x="62" y="90" width="36" height="16" rx="4" fill="#4E35B8"/>'
  '<path d="M66 106c4 20 10 30 14 34 4-4 10-14 14-34z" fill="url(#rocket-flame)"/>'
  '<circle cx="80" cy="56" r="12" fill="#0B0C12"/><circle cx="80" cy="56" r="7" fill="#35D0FF"/>'
  '<g clip-path="url(#rocket-clip)"><ellipse cx="70" cy="44" rx="5" ry="14" fill="#FFFFFF" opacity="0.45" transform="rotate(10 70 44)"/></g>'
  '</g>')
write(f'{OUT}/objects/svg/rocket.svg', rocket)
print('objects ok')
