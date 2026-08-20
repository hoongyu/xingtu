"""把一个星官的成员星换算到「作图坐标系」，供手绘象形用。

坐标系由两颗锚星定义：A=(0,0)、B=(1,0)。图形按这套坐标写死，
渲染时再由实测星位反推相似变换 —— 所以图形永远咬在星上，
换投影、换图面半径都不用重画。
"""
import json, math, pathlib, sys

D = json.loads((pathlib.Path(__file__).resolve().parents[1] / 'web/skydata.json')
               .read_text(encoding='utf-8'))
R = 380


def proj(ra, dec):
    r = (90 - dec) / 180 * R * 2
    a = math.radians(ra) - math.pi / 2
    return (math.cos(a) * r, math.sin(a) * r)


def frame(name, hipA, hipB, culture='iau'):
    g = next(x for x in D['cultures'][culture]['groups'] if x['name'] == name)
    P = {h: proj(*D['stars'][str(h)][:2]) for l in g['lines'] for h in l}
    ax, ay = P[hipA]; bx, by = P[hipB]
    ux, uy = bx - ax, by - ay
    L = math.hypot(ux, uy)
    e1 = (ux / L, uy / L)
    e2 = (-e1[1], e1[0])
    out = {}
    for h, (x, y) in P.items():
        vx, vy = x - ax, y - ay
        out[h] = ((vx * e1[0] + vy * e1[1]) / L, (vx * e2[0] + vy * e2[1]) / L)
    return g, out


if __name__ == '__main__':
    name, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    cul = sys.argv[4] if len(sys.argv) > 4 else 'iau'
    g, F = frame(name, a, b, cul)
    print(f"{name}  锚 A=HIP{a} B=HIP{b}   （A=(0,0) B=(1,0)）")
    for h, (x, y) in sorted(F.items(), key=lambda kv: kv[1][0]):
        mag = D['stars'][str(h)][2]
        print(f"  HIP {h:>6}  ({x:6.3f},{y:7.3f})  mag {mag:4.2f}  {D['names'].get(str(h),'')}")
    print("  lines:", g['lines'])
