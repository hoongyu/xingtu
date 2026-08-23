"""把公版地形裁成星图用得上的那一点点。

两处要用：左下角那只小地球（直径一百七十像素），以及天球上叠的那层
「地影」—— 把地上的轮廓投到天上去。两处都不大，
Natural Earth 1:110m 已经细得看不出来了 —— 再简化一大截也认得出来，
而体积能压掉一多半。

源数据：world-atlas 的 land-110m.json（陆地，54 KB）与
countries-110m.json（国界，105 KB），封装的都是 Natural Earth，
**公有领域，无任何使用限制**。国界那份只取中国一国。
源文件不进仓库（.geosrc/，已 gitignore），进仓库的只有裁完那份。
要重跑时从这里取：
    https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json
    https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json

为什么不直接把 TopoJSON 丢给浏览器：那得带一个解码器，
而且 TopoJSON 的弧共享结构对我们没用 —— 我们只画线，不填色、不做拓扑。
在这里解一次，输出纯坐标折线，运行时零依赖。

简化用 Douglas–Peucker。容差按「小球上的像素」反推：
球半径 62 px，地球半周 180 度对应 62 px，所以 1 px ≈ 2.9 度。
取 0.55 度做容差 —— 约五分之一像素，肉眼绝对看不出，
但点数能掉到原来的三分之一上下。
"""
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / '.geosrc' / 'land-110m.json'
SRC_C = ROOT / '.geosrc' / 'countries-110m.json'
OUT = ROOT / 'web' / 'geo.json'

TOL = 0.55          # 度。见文件头的换算
MIN_PTS = 4         # 简化后不足这么多点的环直接丢（都是米粒大的小岛）


def decode(topo):
    """TopoJSON 解弧。量化过的坐标是增量存的，要先累加再仿射回经纬度。"""
    tr = topo['transform']
    sx, sy = tr['scale']
    tx, ty = tr['translate']
    arcs = []
    for arc in topo['arcs']:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def ring(arcs, idxs):
    """按 TopoJSON 的弧索引拼一个环。负索引表示这条弧要倒着走（~i）。"""
    out = []
    for i in idxs:
        a = arcs[~i][::-1] if i < 0 else arcs[i]
        out.extend(a[1:] if out else a)
    return out


def rdp(pts, tol):
    """Douglas–Peucker。经纬度直接当平面用 —— 这一步只为减点，
    不做等积或等角，误差比线本身的精度小得多。"""
    if len(pts) < 3:
        return pts
    x0, y0 = pts[0]
    x1, y1 = pts[-1]
    dx, dy = x1 - x0, y1 - y0
    den = math.hypot(dx, dy)
    worst, wi = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        if den == 0:
            d = math.hypot(px - x0, py - y0)
        else:
            d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / den
        if d > worst:
            worst, wi = d, i
    if worst <= tol:
        return [pts[0], pts[-1]]
    return rdp(pts[:wi + 1], tol)[:-1] + rdp(pts[wi:], tol)


def rings_of(topo, obj, pick=None):
    """从一个 TopoJSON 对象里取出所有环。pick 给了就只取它选中的那些几何。"""
    arcs = decode(topo)
    out = []
    for g in topo['objects'][obj]['geometries']:
        if pick and not pick(g):
            continue
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
        for poly in polys:
            for r in poly:
                out.append(ring(arcs, r))
    return out


def simplify(rings, tol=TOL):
    out = []
    for r in rings:
        s = rdp(r, tol)
        if len(s) >= MIN_PTS:
            # 扁平存 [lon, lat, lon, lat, …]，比嵌套数组省三成字节
            out.append([round(v, 2) for p in s for v in p])
    return out


def need(path, name):
    if not path.exists():
        url = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/' + name
        raise SystemExit('缺源数据 ' + str(path) + chr(10)
                         + '  取：curl -sL -o .geosrc/' + name + ' ' + url)


def main():
    need(SRC, 'land-110m.json')
    need(SRC_C, 'countries-110m.json')

    land = rings_of(json.loads(SRC.read_text(encoding='utf-8')), 'land')
    # 中国的疆域另画一色，所以单独取。Natural Earth 的 name 字段是 'China'。
    cn = rings_of(json.loads(SRC_C.read_text(encoding='utf-8')), 'countries',
                  lambda g: g.get('properties', {}).get('name') == 'China')
    if not cn:
        raise SystemExit('countries-110m 里没找到 China —— 上游改了字段名？')

    raw = sum(len(r) for r in land) + sum(len(r) for r in cn)
    # 国界比海岸线细，容差给一半，不然西边那几个折角会被抹平
    out = {'land': simplify(land), 'china': simplify(cn, TOL / 2)}
    kept = sum(len(o) // 2 for v in out.values() for o in v)

    OUT.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    kb = OUT.stat().st_size / 1024
    print(f'  陆地    {len(land)} 环 -> {len(out["land"])} 环')
    print(f'  中国    {len(cn)} 环 -> {len(out["china"])} 环')
    print(f'  顶点    {raw} -> {kept}  （{kept / raw * 100:.0f}%）')
    print(f'  源      {(SRC.stat().st_size + SRC_C.stat().st_size) / 1024:.0f} KB'
          f'   ->   产物 {kb:.0f} KB')
    print(f'  -> {OUT.name}')


if __name__ == '__main__':
    main()
