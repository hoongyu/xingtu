"""生成分享缩略图 web/card.png（1200×630）。

链接发到公众号、Twitter、Slack 时抓的就是这张。没有它，
分享出去是一块空白 —— 这一步花几分钟，值。

用系统字体渲染文字到位图里，不打包也不分发字体本身。
"""
import json
import math
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
D = json.loads((ROOT / 'web' / 'skydata.json').read_text(encoding='utf-8'))

W, H = 1200, 630
BG = (5, 7, 12)
INK = (232, 226, 212)
GOLD = (217, 180, 95)
ZHU = (201, 80, 63)

SONG = 'C:/Windows/Fonts/STSONG.TTF'      # 华文宋体，衬线，配这套版式
HEI = 'C:/Windows/Fonts/msyh.ttc'

R = 380


def proj(ra, dec):
    r = (90 - dec) / 180 * R * 2
    a = math.radians(ra) - math.pi / 2
    return math.cos(a) * r, math.sin(a) * r


def build():
    im = Image.new('RGB', (W, H), BG)
    dr = ImageDraw.Draw(im, 'RGBA')

    # 背景微微发亮的天穹
    for i in range(220, 0, -4):
        v = int(9 * (i / 220) ** 2)
        dr.ellipse([W - 330 - i, H // 2 - i, W - 330 + i, H // 2 + i],
                   fill=(11 + v, 15 + v, 26 + v))

    cx, cy = W - 330, H // 2
    scale = 268 / 760                     # 外规半径 760 -> 268 px
    T = lambda p: (cx + p[0] * scale, cy + p[1] * scale)

    # 圆盘边界：南天极在这张投影里摊成整个外圈，星点最远就到这里。
    # 不画这道边，那些星和线看上去像是飘在盘外的。
    edge = R * 2 * scale
    dr.ellipse([cx - edge, cy - edge, cx + edge, cy + edge],
               outline=(232, 226, 212, 26), width=1)

    # 三规
    for dec, col in ((90 - 39.9, (232, 226, 212, 34)), (0, (217, 180, 95, 48)),
                     (-(90 - 39.9), (201, 80, 63, 70))):
        r = (90 - dec) / 180 * R * 2 * scale
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=1)

    stars = D['stars']
    cul = D['cultures']['cn']

    # 连线：有讲解的星官（现在是全部）都画，压得很淡
    for g in cul['groups']:
        for ln in g['lines']:
            raw = [proj(*stars[str(h)][:2]) for h in ln]
            for a, b in zip(raw, raw[1:]):
                # 跳过跨越式的长段：那是投影把近南极的星官撕开留下的假连线，
                # 在缩略图这个尺寸上只会变成几道乱飞的长划。
                if math.hypot(b[0] - a[0], b[1] - a[1]) > 300:
                    continue
                dr.line([T(a), T(b)], fill=(217, 180, 95, 46), width=1)

    # 星点
    for hip, (ra, dec, mag) in stars.items():
        x, y = T(proj(ra, dec))
        r = max(.5, 2.4 - mag * .30) * 1.05
        o = int(255 * max(.22, 1 - mag * .12))
        dr.ellipse([x - r, y - r, x + r, y + r], fill=(232, 226, 212, o))

    # 左侧标题
    f_big = ImageFont.truetype(SONG, 78)
    f_sub = ImageFont.truetype(SONG, 25)
    f_txt = ImageFont.truetype(HEI, 17)
    f_fine = ImageFont.truetype(HEI, 14)

    x0 = 84
    dr.text((x0, 176), '星  圖', font=f_big, fill=INK)
    dr.line([x0, 292, x0 + 132, 292], fill=GOLD, width=1)
    dr.text((x0, 318), '中國星官 · 西方星座', font=f_sub, fill=GOLD)
    dr.text((x0, 372), '三百零八个星官，八十八个星座', font=f_txt,
            fill=(232, 226, 212, 190))
    dr.text((x0, 400), '同一片星空的两种读法', font=f_txt,
            fill=(232, 226, 212, 190))
    dr.text((x0, 452), '每一官每一座都附考据过的来历', font=f_fine,
            fill=(232, 226, 212, 120))
    dr.text((x0, 476), '按观测地筛选，永不升起的星标成朱色', font=f_fine,
            fill=(232, 226, 212, 120))

    out = ROOT / 'web' / 'card.png'
    im.save(out, optimize=True)
    print(f'{out.name}  {out.stat().st_size / 1024:.0f} KB  {W}×{H}')


if __name__ == '__main__':
    build()
