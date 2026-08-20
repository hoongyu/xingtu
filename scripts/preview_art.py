"""把 Stellarium 的星座插画按锚点套到我们的投影上，渲成独立 SVG 验收。

插画自带三颗锚星的像素坐标，三对「像素↔星位」正好定一个仿射变换 ——
平移、旋转、缩放、错切都能吃下，比我手搭的两点相似变换更宽容。
Stellarium 自己也是这么贴的。

插画为纯灰度、黑底不透明（Stellarium 用加色混合）。这里改用
feColorMatrix 把亮度映到金色，再用 screen 混合把黑底吃掉。
"""
import base64
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from figframe import proj, D

ART = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None


def solve3(rows, rhs):
    """3x3 高斯消元。只有三个锚点，不值得拖 numpy 进来。"""
    m = [r[:] + [v] for r, v in zip(rows, rhs)]
    for i in range(3):
        p = max(range(i, 3), key=lambda k: abs(m[k][i]))
        m[i], m[p] = m[p], m[i]
        for k in range(i + 1, 3):
            f = m[k][i] / m[i][i]
            for j in range(i, 4):
                m[k][j] -= f * m[i][j]
    x = [0.0] * 3
    for i in (2, 1, 0):
        x[i] = (m[i][3] - sum(m[i][j] * x[j] for j in range(i + 1, 3))) / m[i][i]
    return x


def affine(anchors):
    """三对 (像素, 星位) → SVG matrix(a,b,c,d,e,f)。"""
    rows = [[a['pos'][0], a['pos'][1], 1.0] for a in anchors]
    sky = [proj(*D['stars'][str(a['hip'])][:2]) for a in anchors]
    a, c, e = solve3(rows, [s[0] for s in sky])
    b, d, f = solve3(rows, [s[1] for s in sky])
    return a, b, c, d, e, f


def render(name_cn, con, img_path, out_path, cul='iau'):
    g = next(x for x in D['cultures'][cul]['groups'] if x['name'] == name_cn)
    P = {h: proj(*D['stars'][str(h)][:2]) for l in g['lines'] for h in l}
    a, b, c, d, e, f = affine(con['image']['anchors'])
    W, H = con['image']['size']

    # 图幅按插画四角与星点的并集取，别把画裁掉
    corners = [(a * x + c * y + e, b * x + d * y + f)
               for x, y in ((0, 0), (W, 0), (0, H), (W, H))]
    xs = [p[0] for p in list(P.values()) + corners]
    ys = [p[1] for p in list(P.values()) + corners]
    pad = max(max(xs) - min(xs), max(ys) - min(ys)) * .08 + 8
    x0, y0 = min(xs) - pad, min(ys) - pad
    w = max(xs) - min(xs) + pad * 2
    h = max(ys) - min(ys) + pad * 2

    b64 = base64.b64encode(pathlib.Path(img_path).read_bytes()).decode()
    lines = ''.join(
        '<path class="ln" d="M' + ' L'.join(f"{P[hp][0]:.1f} {P[hp][1]:.1f}" for hp in ln) + '"/>'
        for ln in g['lines'])
    dots = ''.join(
        f'<circle cx="{P[hp][0]:.1f}" cy="{P[hp][1]:.1f}" '
        f'r="{max(.5, 2.6 - D["stars"][str(hp)][2] * .34):.2f}" class="st"/>' for hp in P)
    anchor_marks = ''.join(
        f'<circle cx="{proj(*D["stars"][str(an["hip"])][:2])[0]:.1f}" '
        f'cy="{proj(*D["stars"][str(an["hip"])][:2])[1]:.1f}" r="{w/150:.1f}" class="anch"/>'
        for an in con['image']['anchors'])
    k = w / 640

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" width="880">
<defs><filter id="gold" color-interpolation-filters="sRGB">
<feColorMatrix type="matrix" values="0.92 0 0 0 0  0.75 0 0 0 0  0.40 0 0 0 0  0 0 0 0 1"/>
</filter></defs>
<style>
  .bg{{fill:#070a11}}
  .ln{{fill:none;stroke:#d9b45f;stroke-width:{k * .40:.2f};opacity:.45;
       stroke-linecap:round;stroke-linejoin:round}}
  .st{{fill:#e8e2d4}}
  .anch{{fill:none;stroke:#c9503f;stroke-width:{k * .5:.2f};opacity:.85}}
  image{{mix-blend-mode:screen;opacity:.72}}
</style>
<rect class="bg" x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}"/>
<image href="data:image/webp;base64,{b64}" x="0" y="0" width="{W}" height="{H}"
       filter="url(#gold)"
       transform="matrix({a:.5f},{b:.5f},{c:.5f},{d:.5f},{e:.3f},{f:.3f})"/>
{lines}{dots}{anchor_marks}
</svg>'''
    pathlib.Path(out_path).write_text(svg, encoding='utf-8')
    return out_path


if __name__ == '__main__':
    idx = json.loads((ART / 'index.json').read_text(encoding='utf-8'))
    outdir = pathlib.Path(__file__).resolve().parents[1] / 'preview'
    outdir.mkdir(exist_ok=True)
    for abbr, cn in (('Cyg', '天鹅座'), ('Ori', '猎户座'),
                     ('Sco', '天蝎座'), ('Leo', '狮子座')):
        con = next(x for x in idx['constellations'] if x['id'].endswith(' ' + abbr))
        img = ART / (con['image']['file'].split('/')[-1])
        print(render(cn, con, img, outdir / f"套图-{cn}.svg"))
