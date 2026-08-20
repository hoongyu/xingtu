"""把概念星图渲成独立 SVG，用来肉眼验收。跟网页同一份数据、同一套坐标。"""
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
D = json.loads((ROOT / 'web' / 'conceptdata.json').read_text(encoding='utf-8'))


def render(culture, out_path, label_level=2):
    S = D['stars']
    cul = D['cultures'][culture]
    outer = D['meta']['outer']
    pad = 96
    x0 = y0 = -(outer + pad)
    w = (outer + pad) * 2

    rings = ''.join(
        f'<circle r="{r}" class="gui{" eq" if i == 1 else ""}"/>'
        for i, r in enumerate(D['meta']['levels'][1:] + [outer]))
    ringlab = ''.join(
        f'<text x="6" y="{-r - 8}" class="rl">{t}</text>'
        for r, t in zip(D['meta']['levels'][1:] + [outer],
                        ['一层 · 主干', '二层 · 方法', '三层 · 技术', '四层 · 术语']))

    # 扇区分界与名字
    secs = ''
    for i, name in enumerate(D['meta']['sectors']):
        a = math.radians(i * 30 - 15 - 90)
        secs += (f'<line x1="0" y1="0" x2="{math.cos(a)*outer:.1f}" '
                 f'y2="{math.sin(a)*outer:.1f}" class="spoke"/>')
        am = math.radians(i * 30 - 90)
        rr = outer + 40
        secs += (f'<text x="{math.cos(am)*rr:.1f}" y="{math.sin(am)*rr:.1f}" '
                 f'class="sec">{name}</text>')

    links, labels = '', ''
    for g in cul['groups']:
        pts = g['lines'][0]
        d = 'M' + ' L'.join(f"{S[h][0]} {S[h][1]}" for h in pts)
        links += f'<path class="ln" d="{d}"/>'
        cx = sum(S[h][0] for h in pts) / len(pts)
        cy = sum(S[h][1] for h in pts) / len(pts)
        labels += f'<text x="{cx:.1f}" y="{cy - 12:.1f}" class="gn">{g["name"]}</text>'

    dots, names = '', ''
    for k, v in S.items():
        x, y, imp, hard, lv, sec = v
        r = max(.6, 3.2 - imp * .55)
        dots += f'<circle cx="{x}" cy="{y}" r="{r:.2f}" class="st"/>'
        if lv <= label_level:
            names += (f'<text x="{x:.1f}" y="{y - r - 4:.1f}" class="nm'
                      f'{" k" if lv <= 1 else ""}">{k}</text>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {w}" width="1180">
<style>
 .bg{{fill:#070a11}}
 .gui{{fill:none;stroke:rgba(232,226,212,.13);stroke-width:1}}
 .gui.eq{{stroke:rgba(217,180,95,.20);stroke-dasharray:4 6}}
 .spoke{{stroke:rgba(232,226,212,.055);stroke-width:.8}}
 .sec{{fill:rgba(232,226,212,.5);font:13px sans-serif;text-anchor:middle;letter-spacing:.15em}}
 .rl{{fill:rgba(232,226,212,.3);font:10px sans-serif;letter-spacing:.14em}}
 .ln{{fill:none;stroke:#d9b45f;stroke-width:1.1;opacity:.42;
      stroke-linecap:round;stroke-linejoin:round}}
 .st{{fill:#e8e2d4}}
 .nm{{fill:rgba(232,226,212,.55);font:9px sans-serif;text-anchor:middle}}
 .nm.k{{fill:rgba(232,226,212,.92);font:12px sans-serif}}
 .gn{{fill:rgba(217,180,95,.9);font:13px serif;text-anchor:middle;letter-spacing:.12em}}
</style>
<rect class="bg" x="{x0}" y="{y0}" width="{w}" height="{w}"/>
{rings}{ringlab}{secs}{links}{dots}{names}{labels}
</svg>'''
    pathlib.Path(out_path).write_text(svg, encoding='utf-8')
    return out_path


if __name__ == '__main__':
    outdir = ROOT / 'preview'
    outdir.mkdir(exist_ok=True)
    for c, fn in (('lineage', '概念星图-技术谱系.svg'), ('pipeline', '概念星图-训练流水线.svg')):
        print(render(c, outdir / fn))
