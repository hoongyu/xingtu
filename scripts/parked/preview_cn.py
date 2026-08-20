"""中国星官验收样张：把若干星官连同图形排成一版，用来肉眼过一遍。

跟网页走同一份 figures.js、同一套变换、同一组类名 —— 样张上好看，
网页上就是那样，不会两边各调一套。
"""
import json
import math
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from figframe import proj, D

ROOT = pathlib.Path(__file__).resolve().parent
DUMP = ROOT / 'dump_figs2.mjs'
DUMP.write_text("import { FIGURES, GLYPHS } from '../web/figures.js';\n"
                "console.log(JSON.stringify({FIGURES, GLYPHS}));\n", encoding='utf-8')
RAW = json.loads(subprocess.run(['node', str(DUMP)], capture_output=True, text=True,
                                encoding='utf-8', cwd=ROOT).stdout)
FIGS, GLY = RAW['FIGURES'], RAW['GLYPHS']

PICK = ['北斗', '螣蛇', '羽林军', '轩辕', '天船', '鹤', '孔雀', '天市右垣',
        '五帝座', '天苑', '库楼', '毕宿', '箕宿', '井宿', '柳宿', '角宿',
        '贯索', '大陵', '华盖', '天狗', '织女', '雷电', '天囷', '阁道',
        '虚宿', '龟', '天钱', '老人']


def panel(name, cul='cn'):
    g = next(x for x in D['cultures'][cul]['groups'] if x['name'] == name)
    f = FIGS.get(name)
    hips = list(dict.fromkeys(h for ln in g['lines'] for h in ln))
    P = {h: proj(*D['stars'][str(h)][:2]) for h in hips}

    if 'fam' in f:
        cx = sum(p[0] for p in P.values()) / len(P)
        cy = sum(p[1] for p in P.values()) / len(P)
        ex, ey = 1.0, 0.0
        if 'b' in f:
            ax, ay = P.get(f['a']) or proj(*D['stars'][str(f['a'])][:2])
            bx, by = P.get(f['b']) or proj(*D['stars'][str(f['b'])][:2])
            dx, dy = bx - ax, by - ay
            L = math.hypot(dx, dy) or 1
            ex, ey = dx / L, dy / L
        k = f['k']
        M = f"matrix({k*ex:.4f},{k*ey:.4f},{-k*ey:.4f},{k*ex:.4f},{cx:.3f},{cy:.3f})"
        art = GLY[f['fam']]
        tag = f['fam']
    else:
        ax, ay = proj(*D['stars'][str(f['a'])][:2])
        bx, by = proj(*D['stars'][str(f['b'])][:2])
        ux, uy = bx - ax, by - ay
        M = f"matrix({ux:.4f},{uy:.4f},{-uy:.4f},{ux:.4f},{ax:.3f},{ay:.3f})"
        art = f
        tag = '逐星'

    sq = lambda t: re.sub(r'\s+', ' ', t).strip()
    body = f'<path class="body" d="{sq(art["d"])}"/>'
    detail = ''.join(f'<path class="{c}" d="{sq(dd)}"/>' for c, dd in art.get('parts', []))
    halo = f'<path class="halo" d="{sq(art["d"])}"/>'

    lines = ''.join('<path class="ln" d="M'
                    + ' L'.join(f"{P[h][0]:.1f} {P[h][1]:.1f}" for h in ln) + '"/>'
                    for ln in g['lines'])
    dots = ''.join(f'<circle cx="{P[h][0]:.1f}" cy="{P[h][1]:.1f}" '
                   f'r="{max(.5, 2.6 - D["stars"][str(h)][2] * .34):.2f}" class="st"/>'
                   for h in P)
    return M, halo, body, detail, lines, dots, tag, P


def main():
    COLS, S = 4, 300
    rows = (len(PICK) + COLS - 1) // COLS
    cells = []
    for i, nm in enumerate(PICK):
        cul = 'cn' if any(x['name'] == nm for x in D['cultures']['cn']['groups']) else 'iau'
        M, halo, body, detail, lines, dots, tag, P = panel(nm, cul)
        xs = [p[0] for p in P.values()]
        ys = [p[1] for p in P.values()]
        span = max(max(xs) - min(xs), max(ys) - min(ys), 30)
        pad = span * .55 + 14
        x0 = (min(xs) + max(xs)) / 2 - span / 2 - pad
        y0 = (min(ys) + max(ys)) / 2 - span / 2 - pad
        w = span + pad * 2
        ox, oy = (i % COLS) * S, (i // COLS) * S
        k = S / w
        cells.append(
            f'<g transform="translate({ox},{oy}) scale({k:.4f}) translate({-x0:.2f},{-y0:.2f})">'
            f'<g filter="url(#gl)"><g transform="{M}">{halo}</g></g>'
            f'<g transform="{M}">{body}{detail}</g>{lines}{dots}</g>'
            f'<text x="{ox+10}" y="{oy+24}" class="nm">{nm}</text>'
            f'<text x="{ox+S-10}" y="{oy+24}" class="fm">{tag}</text>')

    W, H = COLS * S, rows * S
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="1200">
<defs><filter id="gl" x="-30%" y="-30%" width="160%" height="160%">
<feGaussianBlur stdDeviation="2.4"/></filter></defs>
<style>
 .bg{{fill:#070a11}}
 .ln{{fill:none;stroke:#d9b45f;stroke-width:0.8;opacity:.45;stroke-linecap:round;stroke-linejoin:round}}
 .st{{fill:#e8e2d4}}
 .halo{{fill:rgba(217,180,95,.30);stroke:#d9b45f;stroke-width:2;opacity:.5;stroke-linejoin:round;
        vector-effect:non-scaling-stroke}}
 .body{{fill:rgba(217,180,95,.32);stroke:rgba(232,226,212,.55);stroke-width:.85;
        stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}}
 .plume{{fill:rgba(217,180,95,.20);stroke:rgba(232,226,212,.42);stroke-width:.55;
         stroke-linejoin:round;vector-effect:non-scaling-stroke}}
 .covert{{fill:rgba(217,180,95,.30);stroke:rgba(232,226,212,.38);stroke-width:.5;
          stroke-linejoin:round;vector-effect:non-scaling-stroke}}
 .vein{{fill:none;stroke:rgba(28,20,6,.46);stroke-width:.55;stroke-linecap:round;
        vector-effect:non-scaling-stroke}}
 .dark{{fill:rgba(28,20,6,.55)}}
 .eye{{fill:rgba(22,16,5,.85)}}
 .nm{{fill:rgba(232,226,212,.9);font:15px sans-serif}}
 .fm{{fill:rgba(232,226,212,.35);font:11px sans-serif;text-anchor:end}}
</style>
<rect class="bg" width="{W}" height="{H}"/>
{''.join(cells)}</svg>'''
    out = ROOT.parent / 'preview' / '中国星官样张.svg'
    out.write_text(svg, encoding='utf-8')
    (ROOT.parent / 'web' / '_cn.svg').write_text(svg, encoding='utf-8')
    print(out, f"{len(svg)/1024:.0f} KB")


if __name__ == '__main__':
    main()
