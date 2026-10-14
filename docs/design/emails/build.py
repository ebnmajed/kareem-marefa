"""Kareem Marefa — notification email builder.

Produces two sets from one source:
  dist/templates/*.html  production templates with {{placeholders}} (hosted image URLs)
  dist/preview/*.html    filled with sample data, images inlined (for review only)
"""
import base64, pathlib, re

OUT = pathlib.Path('dist')

# ---------- tokens ----------
C = dict(
    page='#0E0E12', card='#16161C', raised='#1F1F27', line='#2B2B35',
    text='#F5F5F7', muted='#9C9CAB', faint='#6B6B7A',
    lime='#C6FF3D', lime_ink='#10140A', violet='#9B7CFF', orange='#FF9A2E', coral='#FF6E4F',
    violet_tint='#262040', lime_tint='#23300F', orange_tint='#3A2A14', coral_tint='#3A1F1A',
)
FONT = "'Baloo Bhaijaan 2','Segoe UI',Tahoma,Arial,sans-serif"


def t(size, weight=400, color=None, lh=1.5, extra=''):
    return (f"font-family:{FONT};font-size:{size}px;line-height:{lh};font-weight:{weight};"
            f"color:{color or C['text']};{extra}")


# ---------- components ----------
def stripe():
    cells = ''.join(f'<td width="25%" height="4" style="height:4px;line-height:4px;font-size:0;background:{c}">&nbsp;</td>'
                    for c in (C['lime'], C['violet'], C['orange'], C['coral']))
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{cells}</tr></table>'


def chip(label, fg, bg):
    return (f'<span style="display:inline-block;{t(13, 700, fg, 1)}background:{bg};'
            f'border-radius:999px;padding:7px 14px 5px;">{label}</span>')


def button(label, href, bg=None, fg=None, w=None):
    bg, fg = bg or C['lime'], fg or C['lime_ink']
    width_attr = f'width:{w}px;' if w else ''
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn-wrap"><tr><td align="center" bgcolor="{bg}" style="border-radius:999px;{width_attr}">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{href}" style="height:52px;v-text-anchor:middle;width:220px" arcsize="50%" stroke="f" fillcolor="{bg}"><center style="color:{fg};font-family:Tahoma,sans-serif;font-size:16px;font-weight:bold">{label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="{href}" class="btn" style="display:inline-block;{t(16, 700, fg, 1)}text-decoration:none;padding:17px 32px 14px;border-radius:999px;">{label}</a><!--<![endif]-->
</td></tr></table>'''


def link(label, href, color=None):
    return f'<a href="{href}" style="{t(15, 600, color or C["muted"], 1)}text-decoration:none;">{label}</a>'


def avatar(initials, bg, size=40, fg=None):
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="{size}" height="{size}" align="center" valign="middle" '
            f'style="width:{size}px;height:{size}px;border-radius:50%;background:{bg};{t(int(size*.38), 800, fg or C["lime_ink"], 1)}">{initials}</td></tr></table>')


def spacer(h):
    return f'<tr><td height="{h}" style="height:{h}px;line-height:{h}px;font-size:0">&nbsp;</td></tr>'


def row(html, pad='0 32px', cls='px'):
    return f'<tr><td class="{cls}" style="padding:{pad}">{html}</td></tr>'


def when_strip(v, accent=None):
    """Day block + time + venue — scanned in one glance, no labels."""
    accent = accent or C['lime']
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{C['raised']};border-radius:18px"><tr>
<td width="76" align="center" valign="middle" style="padding:16px 0 14px 0;border-left:1px solid {C['line']}">
  <div style="{t(34, 800, accent, 1)}">{v['day']}</div>
  <div style="{t(13, 600, C['muted'], 1.3)}padding-top:4px">{v['month']}</div>
</td>
<td valign="middle" style="padding:14px 18px">
  <div style="{t(17, 700, C['text'], 1.35)}">{v['weekday']} · {v['time']}</div>
  <div style="{t(15, 500, C['muted'], 1.4)}padding-top:2px">{v['venue']}</div>
</td></tr></table>'''


def presenter(v):
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle">{avatar(v['presenter_initials'], C['violet'], 32, '#140F2A')}</td>
<td valign="middle" style="padding-right:10px;{t(15, 600, C['text'], 1.2)}">{v['presenter']}</td>
</tr></table>'''


def seats_bar(v):
    taken = int(v['seats_taken_pct']) if str(v['seats_taken_pct']).isdigit() else 70
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="{t(14, 600, C['muted'], 1)}padding-bottom:8px"><span style="color:{C['orange']};font-weight:800">{v['seats_left']}</span> مقعدًا متبقيًا</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:999px;background:{C['raised']}"><tr>
<td width="{taken}%" height="6" style="height:6px;line-height:6px;font-size:0;border-radius:999px;background:{C['orange']}">&nbsp;</td><td style="font-size:0">&nbsp;</td>
</tr></table></td></tr></table>'''


def ticket(v, head_bg=None, head_fg=None, label='تذكرتك'):
    """The reserved seat as an object: coloured stub + check-in QR."""
    head_bg, head_fg = head_bg or C['lime'], head_fg or C['lime_ink']
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:22px;overflow:hidden;background:{C['raised']}">
<tr><td bgcolor="{head_bg}" style="background:{head_bg};padding:22px 24px 20px;border-radius:22px 22px 0 0">
  <div style="{t(13, 700, head_fg, 1)}opacity:.65;padding-bottom:8px">{label}</div>
  <div style="{t(22, 800, head_fg, 1.3)}">{v['title']}</div>
</td></tr>
<tr><td style="padding:0 18px"><div style="border-top:2px dashed {C['line']};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>
<tr><td style="padding:20px 24px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td valign="middle">
    <div style="{t(15, 700, C['text'], 1.4)}">{v['weekday']} {v['day']} {v['month']} · {v['time']}</div>
    <div style="{t(14, 500, C['muted'], 1.5)}">{v['venue']}</div>
    <div style="{t(13, 700, C['faint'], 1)}padding-top:12px;letter-spacing:1px" dir="ltr" align="right">{v['ticket_ref']}</div>
  </td>
  <td width="96" align="left" valign="middle"><img src="{v['qr_url']}" width="88" height="88" alt="QR" style="display:block;border-radius:10px;background:#fff;padding:6px;border:0"></td>
</tr></table></td></tr></table>'''


def stat(value, label, color):
    return (f'<td align="center" valign="top" style="padding:16px 4px;background:{C["raised"]};border-radius:16px">'
            f'<div style="{t(26, 800, color, 1)}">{value}</div><div style="{t(13, 600, C["muted"], 1.3)}padding-top:6px">{label}</div></td>')


def stats(items):
    gap = '<td width="8" style="font-size:0">&nbsp;</td>'
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            + gap.join(stat(*i) for i in items) + '</tr></table>')


# ---------- shell ----------
HEAD = '''<!doctype html>
<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,date=no,address=no">
<title>{subject}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
{fontface}
:root{{color-scheme:dark;supported-color-schemes:dark}}
body{{margin:0!important;padding:0!important;width:100%!important;background:{page}}}
table,td{{mso-table-lspace:0;mso-table-rspace:0}} img{{-ms-interpolation-mode:bicubic;border:0;outline:none}}
a{{text-decoration:none}}
@media (max-width:620px){{
  .shell{{width:100%!important}} .px{{padding-left:20px!important;padding-right:20px!important}}
  .h1{{font-size:26px!important}} .hero{{font-size:64px!important}}
  .btn-wrap,.btn-wrap td{{width:100%!important}} .btn{{display:block!important;text-align:center!important}}
}}
</style>
</head>'''


def shell(v, preheader, body, accent=None):
    accent = accent or C['lime']
    pad = '&#847;&zwnj;&nbsp;' * 40
    return HEAD.format(subject=v['_subject'], fontface=v.get('_fontface', ''), page=C['page']) + f'''
<body style="margin:0;padding:0;background:{C['page']}" bgcolor="{C['page']}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">{preheader}{pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{C['page']}" style="background:{C['page']}" dir="rtl"><tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px" dir="rtl">

<!-- brand -->
<tr><td style="padding:0 8px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td valign="middle"><a href="{v['app_url']}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle"><img src="{v['logo_url']}" width="24" height="33" alt="" style="display:block"></td>
    <td valign="middle" style="padding-right:10px;{t(19, 800, C['text'], 1)}">كريم معرفة</td>
  </tr></table></a></td>
  <td valign="middle" align="left" style="{t(13, 600, C['faint'], 1)}">{v['company']}</td>
</tr></table></td></tr>

<!-- card -->
<tr><td bgcolor="{C['card']}" style="background:{C['card']};border-radius:28px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-radius:28px 28px 0 0;overflow:hidden">{stripe()}</td></tr>
{spacer(32)}
{body}
{spacer(36)}
</table></td></tr>

<!-- footer -->
<tr><td align="center" style="padding:26px 16px 0">
  <div style="{t(13, 600, C['faint'], 1.8)}">
    {link('الإعدادات', v['settings_url'], C['muted'])}&nbsp;&nbsp;·&nbsp;&nbsp;{link('إيقاف هذه الرسائل', v['unsubscribe_url'], C['muted'])}
  </div>
  <div style="{t(12, 500, C['faint'], 1.8)}">شبه الجزيرة · الرياض</div>
</td></tr>
</table></td></tr></table>
</body></html>'''


# ---------- the six notifications ----------
def new_session(v):
    body = (
        row(chip(v['type'], C['violet'], C['violet_tint'])) + spacer(16) +
        row(f'<a href="{v["session_url"]}"><img src="{v["poster_url"]}" width="536" alt="" style="display:block;width:100%;max-width:536px;height:auto;border-radius:18px"></a>') + spacer(22) +
        row(f'<h1 class="h1" style="margin:0;{t(28, 800, C["text"], 1.3)}">{v["title"]}</h1>') + spacer(20) +
        row(when_strip(v)) + spacer(18) +
        row(presenter(v)) + spacer(26) +
        row(seats_bar(v)) + spacer(28) +
        row(button('احجز مقعدك', v['session_url']))
    )
    return shell(v, f"{v['weekday']} {v['day']} {v['month']} · {v['venue']}", body)


def booking_confirmed(v):
    body = (
        row(f'<div style="{t(15, 700, C["lime"], 1)}">تم الحجز</div>') + spacer(10) +
        row(f'<h1 class="h1" style="margin:0;{t(30, 800, C["text"], 1.3)}">مقعدك محجوز، {v["first_name"]}</h1>') + spacer(26) +
        row(ticket(v)) + spacer(20) +
        row(stats([('<span dir="ltr">' + v['points_on_attend'] + '</span>', 'نقطة عند الحضور', C['lime']), (v['going_count'], 'سيحضرون', C['violet'])])) + spacer(28) +
        row(f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td>{button('أضف إلى التقويم', v['calendar_url'])}</td></tr>
          <tr><td style="padding-top:18px">{link('عرض الجلسة', v['session_url'])}&nbsp;&nbsp;<span style="color:{C['line']}">|</span>&nbsp;&nbsp;{link('إلغاء الحجز', v['cancel_url'], C['faint'])}</td></tr></table>''')
    )
    return shell(v, f"{v['title']} — {v['weekday']} {v['time']}", body)


def reminder(v):
    hero = v['countdown']
    body = (
        row(f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="bottom"><div class="hero" style="{t(76, 800, C['lime'], 1)}">{hero}</div></td>
          <td valign="bottom" align="left" style="padding-bottom:10px"><div style="{t(30, 800, C['text'], 1)}" dir="rtl">{v['time']}</div></td>
        </tr></table>''') + spacer(26) +
        row(ticket(v, C['violet'], '#140F2A', 'امسح عند الوصول')) + spacer(24) +
        row(presenter(v)) + spacer(28) +
        row(f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td>{button('الاتجاهات', v['map_url'])}</td></tr>
          <tr><td style="padding-top:18px">{link('عرض الجلسة', v['session_url'])}&nbsp;&nbsp;<span style="color:{C['line']}">|</span>&nbsp;&nbsp;{link('لن أحضر', v['cancel_url'], C['faint'])}</td></tr></table>''')
    )
    return shell(v, f"{v['title']} · {v['time']} · {v['venue']}", body)


def activity(v):
    body = (
        row(f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">{avatar(v['actor_initials'], C['orange'], 48, '#2A1600')}</td>
          <td valign="middle" style="padding-right:14px"><div style="{t(19, 800, C['text'], 1.3)}">{v['actor']}</div>
            <div style="{t(14, 500, C['muted'], 1.3)}">علّق على جلستك · {v['ago']}</div></td></tr></table>''') + spacer(20) +
        row(f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:{C['raised']};border-radius:6px 22px 22px 22px;padding:20px 22px;{t(18, 500, C['text'], 1.7)}">{v['comment']}</td></tr></table>''') + spacer(14) +
        row(f'<div style="{t(14, 600, C["muted"], 1.5)}">على <span style="color:{C["text"]}">{v["title"]}</span></div>') + spacer(22) +
        row(f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-left:24px;{t(15, 600, C['muted'], 1)}"><span style="{t(17, 800, C['coral'], 1)}">{v['likes']}</span> إعجابًا</td>
          <td style="{t(15, 600, C['muted'], 1)}"><span style="{t(17, 800, C['violet'], 1)}">{v['comments']}</span> تعليقات</td></tr></table>''') + spacer(28) +
        row(button('ردّ', v['comment_url']))
    )
    return shell(v, f"{v['actor']}: {v['comment'][:60]}", body)


def leaderboard(v):
    def podium_row(rank, name, initials, team, pts, color, me=False):
        bg = C['lime_tint'] if me else 'transparent'
        nm = C['lime'] if me else C['text']
        return f'''<tr><td style="padding:3px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{bg};border-radius:16px"><tr>
          <td width="40" align="center" style="padding:12px 0;{t(17, 800, color, 1)}">{rank}</td>
          <td width="40" style="padding:8px 0">{avatar(initials, team, 36, '#111')}</td>
          <td style="padding:8px 12px;{t(16, 700, nm, 1.2)}">{name}</td>
          <td align="left" style="padding:8px 16px;{t(16, 800, C['text'], 1)}">{pts}</td></tr></table></td></tr>'''
    rows = (podium_row('1', 'سارة القحطاني', 'سق', C['orange'], '1,240', C['orange'])
            + podium_row('2', 'خالد حامد', 'خح', C['violet'], '1,105', C['muted'])
            + podium_row('3', 'عصام الدروبي', 'عد', C['coral'], '980', C['coral'])
            + f'<tr><td align="center" style="{t(18, 800, C["faint"], 1)}padding:4px 0">···</td></tr>'
            + podium_row(v['rank'], v['full_name'], v['initials'], C['lime'], v['points'], C['lime'], True))
    body = (
        row(chip(v['week_label'], C['lime'], C['lime_tint'])) + spacer(18) +
        row(f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="bottom"><div style="{t(15, 600, C['muted'], 1)}">ترتيبك</div><div class="hero" style="{t(84, 800, C['text'], 1)}">#{v['rank']}</div></td>
          <td valign="bottom" align="left" style="padding-bottom:14px">{chip('<span dir="ltr">↑ ' + v['rank_delta'] + '</span>', C['lime'], C['lime_tint'])}</td></tr></table>''') + spacer(22) +
        row(stats([(v['attended'], 'حضور', C['lime']), (v['presented'], 'تقديم', C['violet']), (v['interactions'], 'تفاعل', C['orange'])])) + spacer(26) +
        row(f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table>') + spacer(28) +
        row(button('لوحة الصدارة', v['leaderboard_url']))
    )
    return shell(v, f"#{v['rank']} هذا الأسبوع · {v['points']} نقطة", body)


def after_session(v):
    body = (
        row(f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="bottom"><div class="hero" style="{t(76, 800, C['lime'], 1)}" dir="ltr" align="right">+{v['points_earned']}</div></td>
          <td valign="bottom" align="left" style="padding-bottom:12px;{t(16, 700, C['muted'], 1)}">نقطة</td></tr></table>''') + spacer(8) +
        row(f'<div style="{t(17, 600, C["text"], 1.5)}">شكرًا لحضورك <span style="font-weight:800">{v["title"]}</span></div>') + spacer(24) +
        row(f'''<a href="{v['certificate_url']}" style="text-decoration:none"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:20px;background:{C['raised']};border:1px solid {C['line']}"><tr>
          <td style="padding:24px"><div style="{t(13, 700, C['violet'], 1)}">شهادة حضور</div>
            <div style="{t(22, 800, C['text'], 1.3)}padding-top:8px">{v['full_name']}</div>
            <div style="{t(13, 600, C['faint'], 1)}padding-top:14px" dir="ltr" align="right">{v['cert_id']}</div></td>
          <td width="70" align="left" valign="middle" style="padding-left:24px"><img src="{v['logo_url']}" width="44" height="60" alt="" style="display:block"></td></tr></table></a>''') + spacer(24) +
        row(f'''<div style="{t(15, 600, C['muted'], 1)}padding-bottom:12px">قيّم الجلسة</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>''' +
            ''.join(f'<td style="padding-left:8px"><a href="{v["rate_url"]}?r={n}" style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;border-radius:14px;background:{C["raised"]};{t(17, 800, C["text"], 44/17)}">{n}</a></td>' for n in range(1, 6)) +
            '</tr></table>') + spacer(28) +
        row(button('حمّل الشهادة', v['certificate_url']))
    )
    return shell(v, f"+{v['points_earned']} نقطة · شهادتك جاهزة", body)


# ---------- data ----------
EMAILS = {
    'new-session':        (new_session,        'جلسة جديدة: {{title}}'),
    'booking-confirmed':  (booking_confirmed,  'مقعدك محجوز: {{title}}'),
    'reminder-tomorrow':  (reminder,           'غدًا {{time}}: {{title}}'),
    'reminder-week':      (reminder,           'بعد أسبوع: {{title}}'),
    'activity-comment':   (activity,           '{{actor}} علّق على جلستك'),
    'weekly-leaderboard': (leaderboard,        'أنت #{{rank}} هذا الأسبوع'),
    'after-session':      (after_session,      '+{{points_earned}} نقطة · شهادتك جاهزة'),
}

FIELDS = ['app_url', 'logo_url', 'company', 'settings_url', 'unsubscribe_url', 'type', 'title', 'session_url', 'poster_url',
          'day', 'month', 'weekday', 'time', 'venue', 'presenter', 'presenter_initials', 'seats_left', 'seats_taken_pct',
          'first_name', 'full_name', 'initials', 'ticket_ref', 'qr_url', 'points_on_attend', 'going_count', 'calendar_url',
          'cancel_url', 'map_url', 'countdown', 'actor', 'actor_initials', 'ago', 'comment', 'likes', 'comments', 'comment_url',
          'week_label', 'rank', 'rank_delta', 'points', 'attended', 'presented', 'interactions', 'leaderboard_url',
          'points_earned', 'certificate_url', 'cert_id', 'rate_url']


def data_uri(p, mime):
    return f'data:{mime};base64,' + base64.b64encode(pathlib.Path(p).read_bytes()).decode()


SAMPLE = dict(
    app_url='https://kareem.pp.sa', logo_url=data_uri('assets/logo-mark@2x.png', 'image/png'), company='جذر',
    settings_url='#', unsubscribe_url='#', type='ورشة', title='من الفرصة إلى النمو: تطوير الأعمال في عصر الذكاء الاصطناعي',
    session_url='#', poster_url=data_uri('assets/poster-sample.jpg', 'image/jpeg'),
    day='18', month='أكتوبر', weekday='الأحد', time='4:00 م', venue='مكتب شبه الجزيرة',
    presenter='الوليد باعقبة', presenter_initials='وب', seats_left='12', seats_taken_pct='70',
    first_name='يمان', full_name='يمان رضا', initials='ير', ticket_ref='KM-4821', qr_url=data_uri('assets/qr-sample.png', 'image/png'),
    points_on_attend='+25', going_count='38', calendar_url='#', cancel_url='#', map_url='#', countdown='غدًا',
    actor='سارة القحطاني', actor_initials='سق', ago='قبل 5 دقائق',
    comment='الجزء عن تسعير الخدمات كان أوضح شرح سمعته. هل يمكن مشاركة الشرائح؟', likes='24', comments='7', comment_url='#',
    week_label='12 – 18 أكتوبر', rank='4', rank_delta='2', points='860', attended='3', presented='1', interactions='42',
    leaderboard_url='#', points_earned='25', certificate_url='#', cert_id='CERT-2026-0918', rate_url='#',
)
VARIANTS = {'reminder-week': dict(countdown='7 أيام')}

if __name__ == '__main__':
    import sys
    fontface = pathlib.Path('fontface.css').read_text() if '--localfont' in sys.argv else ''
    for d in ('templates', 'preview'):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    for name, (fn, subject) in EMAILS.items():
        # production template: every field is a {{placeholder}}
        tv = {f: '{{' + f + '}}' for f in FIELDS}
        tv['seats_taken_pct'] = '{{seats_taken_pct}}'
        tv['_subject'] = subject
        html = fn(tv)
        html = html.replace('width="70%"', 'width="{{seats_taken_pct}}%"')
        (OUT / 'templates' / f'{name}.html').write_text(html)
        # preview: sample data
        sv = {**SAMPLE, **VARIANTS.get(name, {})}
        sv['_subject'] = re.sub(r'\{\{(\w+)\}\}', lambda m: sv[m.group(1)], subject)
        sv['_fontface'] = fontface
        (OUT / 'preview' / f'{name}.html').write_text(fn(sv))
    print('built', len(EMAILS))
