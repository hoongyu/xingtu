"""把一个象形图渲成独立 SVG，用来肉眼验收画得像不像。

浏览器面板截不到图时，这是唯一能把画稿摆到人眼前的办法。
画的内容跟网页里完全一致：同一份 figures.js、同一个变换。
"""
import json, math, pathlib, re, subprocess, sys
from figframe import proj, D

ROOT = pathlib.Path(__file__).resolve().parent
FIGS = json.loads(subprocess.run(['node', str(ROOT / 'dump_figures.mjs')],
                                 capture_output=True, text=True,
                                 encoding='utf-8', cwd=ROOT).stdout)


def render(name, out_path):
    f = FIGS[name]
    cul = 'cn' if any(g['name'] == name for g in D['cultures']['cn']['groups']) else 'iau'
    g = next(x for x in D['cultures'][cul]['groups'] if x['name'] == name)
    P = {h: proj(*D['stars'][str(h)][:2]) for l in g['lines'] for h in l}

    ax, ay = P[f['a']]; bx, by = P[f['b']]
    ux, uy = bx - ax, by - ay
    M = f"matrix({ux:.4f},{uy:.4f},{-uy:.4f},{ux:.4f},{ax:.3f},{ay:.3f})"

    xs = [p[0] for p in P.values()]; ys = [p[1] for p in P.values()]
    pad = max(max(xs) - min(xs), max(ys) - min(ys)) * .22 + 12
    x0, y0 = min(xs) - pad, min(ys) - pad
    w, h = max(xs) - min(xs) + pad * 2, max(ys) - min(ys) + pad * 2

    lines = ''.join(
        '<path class="ln" d="M' + ' L'.join(f"{P[hp][0]:.1f} {P[hp][1]:.1f}" for hp in ln) + '"/>'
        for ln in g['lines'])
    dots = ''.join(
        f'<circle cx="{P[hp][0]:.1f}" cy="{P[hp][1]:.1f}" '
        f'r="{max(.5, 2.6 - D["stars"][str(hp)][2] * .34):.2f}" class="st"/>'
        for hp in P)
    sq = lambda t: re.sub(r'\s+', ' ', t).strip()
    detail = ''.join(f'<path class="{c}" d="{sq(x)}"/>' for c, x in f.get('parts', []))
    d = sq(f['d'])
    k = w / 640                                # 线宽随图幅缩放，观感与网页一致

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" width="820">
<defs><filter id="gl" x="-35%" y="-35%" width="170%" height="170%">
<feGaussianBlur stdDeviation="{w/190:.2f}"/></filter></defs>
<style>
  .bg{{fill:#070a11}}
  .ln{{fill:none;stroke:#d9b45f;stroke-width:{k*.38:.2f};opacity:.42;
       stroke-linecap:round;stroke-linejoin:round}}
  .st{{fill:#e8e2d4}}
  .halo{{fill:rgba(217,180,95,.10);stroke:#d9b45f;stroke-width:{k*2.6:.2f};opacity:.5;
        stroke-linejoin:round;stroke-linecap:round}}
  .body{{fill:rgba(217,180,95,.055);stroke:rgba(232,226,212,.5);stroke-width:{k*.8:.2f};
        stroke-linejoin:round;stroke-linecap:round}}
  .plume{{fill:rgba(232,226,212,.085);stroke:rgba(232,226,212,.40);
         stroke-width:{k*.55:.2f};stroke-linejoin:round}}
  .covert{{fill:rgba(232,226,212,.15);stroke:rgba(232,226,212,.34);
          stroke-width:{k*.5:.2f};stroke-linejoin:round}}
  .vein{{fill:none;stroke:rgba(232,226,212,.26);stroke-width:{k*.45:.2f};
        stroke-linecap:round}}
  .dark{{fill:rgba(217,180,95,.52)}}
  .eye{{fill:#e8e2d4;opacity:.85}}
</style>
<rect class="bg" x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}"/>
<g filter="url(#gl)"><g transform="{M}"><path class="halo" d="{d}"/></g></g>
<g transform="{M}"><path class="body" d="{d}"/>{detail}</g>
{lines}{dots}
</svg>'''
    pathlib.Path(out_path).write_text(svg, encoding='utf-8')
    return out_path


if __name__ == '__main__':
    names = sys.argv[1:] or list(FIGS)
    outdir = ROOT.parent / 'preview'; outdir.mkdir(exist_ok=True)
    for n in names:
        print(render(n, outdir / f"{n}.svg"))
