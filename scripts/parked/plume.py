"""细节笔法：羽、鳞、节。

三者是同一件事 —— 沿一条中线重复排列的单元。写成生成器而不是逐个手画，
一是画不完（396 个星官），二是手画必然风格漂移。参数改一处，全部跟着变。
"""
import math
from ribbon import ribbon, catmull


def along(pts, t):
    """折线上按弧长取点，t∈[0,1]。"""
    C = catmull(pts, 6)
    seg = [math.hypot(C[i+1][0]-C[i][0], C[i+1][1]-C[i][1]) for i in range(len(C)-1)]
    tot = sum(seg) or 1e-9
    want = max(0.0, min(1.0, t)) * tot
    acc = 0.0
    for i, s in enumerate(seg):
        if acc + s >= want:
            f = (want - acc) / (s or 1e-9)
            return (C[i][0] + (C[i+1][0]-C[i][0])*f, C[i][1] + (C[i+1][1]-C[i][1])*f)
        acc += s
    return C[-1]


def feather(base, tip, w, camber=.12, n=3):
    """一枚羽：叶形，根部略窄、前三分之一最宽、末端收尖，带一点弧度。"""
    bx, by = base; tx, ty = tip
    dx, dy = tx - bx, ty - by
    L = math.hypot(dx, dy) or 1e-9
    nx, ny = -dy / L, dx / L
    pts, ws = [], [w*.30, w, w*.86, w*.52, 0.0]
    for t in (0.0, .28, .58, .82, 1.0):
        c = camber * math.sin(math.pi * t) * L
        pts.append((bx + dx*t + nx*c, by + dy*t + ny*c))
    return ribbon(pts, ws, n=n, tip=True)


def shaft(base, tip, camber=.12):
    """羽轴：一条细线，让羽片不至于糊成一块。"""
    bx, by = base; tx, ty = tip
    dx, dy = tx - bx, ty - by
    L = math.hypot(dx, dy) or 1e-9
    nx, ny = -dy / L, dx / L
    p = []
    for t in (0.0, .5, .9):
        c = camber * math.sin(math.pi * t) * L
        p.append((bx + dx*t + nx*c, by + dy*t + ny*c))
    return (f"M{p[0][0]:.3f} {p[0][1]:.3f} Q{p[1][0]:.3f} {p[1][1]:.3f} "
            f"{p[2][0]:.3f} {p[2][1]:.3f}")


def wing(lead, trail, n=11, sweep=.16, w=.030, camber=.13, u0=.04, u1=.99):
    """一扇翅膀。lead 从肩到翼尖，trail 从体侧到翼尖 —— 两条边围出的透镜形
    就是翼面；羽根排在 lead 上，羽尖落在 trail 上，再整体朝翼尖偏移一点，
    那个偏移就是鸟翼「后掠」的观感来源。"""
    plumes, shafts = [], []
    for k in range(n):
        u = u0 + (u1 - u0) * (k + .5) / n
        b = along(lead, u)
        e = along(trail, min(.995, u + sweep))
        L = math.hypot(e[0]-b[0], e[1]-b[1])
        if L < .02:
            continue
        plumes.append(feather(b, e, w * min(1.0, .45 + L * 1.5), camber))
        shafts.append(shaft(b, e, camber))
    return plumes, shafts


def coverts(lead, inward, n=7, w=.022, frac=.30):
    """覆羽：贴着翼前缘的一排短羽，盖住飞羽的根部。"""
    out = []
    for k in range(n):
        u = .06 + .80 * (k + .5) / n
        b = along(lead, u)
        e = along(inward, min(.99, u + .10))
        out.append(feather(b, (b[0] + (e[0]-b[0])*frac, b[1] + (e[1]-b[1])*frac),
                           w, .10))
    return out


def scales(center, widths, rows=26, k=.62, back=.55):
    """鳞：沿中线一排叠瓦状的弧。每片跨体宽的 k 倍，向尾侧兜。"""
    out = []
    for i in range(rows):
        t = (i + .5) / rows
        p = along(center, t)
        q = along(center, min(1.0, t + .012))
        dx, dy = q[0]-p[0], q[1]-p[1]
        L = math.hypot(dx, dy) or 1e-9
        ux, uy = dx/L, dy/L
        nx, ny = -uy, ux
        u = min(t * (len(widths)-1), len(widths)-1.0001)
        j = int(u); f = u - j
        wd = (widths[j]*(1-f) + widths[j+1]*f) * k
        a = (p[0] + nx*wd, p[1] + ny*wd)
        b = (p[0] - nx*wd, p[1] - ny*wd)
        c = (p[0] + ux*wd*back, p[1] + uy*wd*back)
        out.append(f"M{a[0]:.3f} {a[1]:.3f} Q{c[0]:.3f} {c[1]:.3f} {b[0]:.3f} {b[1]:.3f}")
    return out


def segments(center, widths, rows=9, k=.92):
    """节：甲壳类的分节横线，比鳞更硬更疏。"""
    out = []
    for i in range(rows):
        t = (i + .7) / (rows + .4)
        p = along(center, t); q = along(center, min(1.0, t + .01))
        dx, dy = q[0]-p[0], q[1]-p[1]
        L = math.hypot(dx, dy) or 1e-9
        nx, ny = -dy/L, dx/L
        u = min(t * (len(widths)-1), len(widths)-1.0001)
        j = int(u); f = u - j
        wd = (widths[j]*(1-f) + widths[j+1]*f) * k
        out.append(f"M{p[0]+nx*wd:.3f} {p[1]+ny*wd:.3f} L{p[0]-nx*wd:.3f} {p[1]-ny*wd:.3f}")
    return out


def crest(center, widths, t0=.03, t1=.62, amp=.055, waves=5., n=110, side=1):
    """背鳍：贴着体侧的一道连续波浪，两端收平。

    原来用 11 根三角尖刺，扎眼且碎。连续鳍是一整块，缩到很小也还成形。
    """
    inn, out = [], []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        p = along(center, t); q = along(center, min(1., t + .006))
        dx, dy = q[0] - p[0], q[1] - p[1]
        L = math.hypot(dx, dy) or 1e-9
        nx, ny = -dy / L * side, dx / L * side
        u = min(t * (len(widths) - 1), len(widths) - 1.0001)
        j = int(u); f = u - j
        w = widths[j] * (1 - f) + widths[j + 1] * f
        s = i / n
        h = amp * math.sin(math.pi * s) ** .6 * (.5 + .5 * abs(math.sin(math.pi * waves * s)))
        inn.append((p[0] + nx * w * .88, p[1] + ny * w * .88))
        out.append((p[0] + nx * (w + h), p[1] + ny * (w + h)))
    d = 'M' + ' L'.join(f"{x:.3f} {y:.3f}" for x, y in out)
    d += ' L' + ' L'.join(f"{x:.3f} {y:.3f}" for x, y in reversed(inn)) + ' Z'
    return d


def head_wedge(origin, direction, length, profile):
    """兽首：沿给定方向的楔形。profile 是 [(t, 半宽), ...]，t∈[0,1]。

    蛇头认不出来的两个原因，这里都要治：颈necking 不够（头必须明显比颈宽），
    以及头戳进了自己的身子（方向得挑空处，蛇本来就会扭头）。
    """
    ox, oy = origin
    ux, uy = direction
    m = math.hypot(ux, uy) or 1e-9
    ux, uy = ux / m, uy / m
    pts = [(ox + ux * length * t, oy + uy * length * t) for t, _ in profile]
    ws = [w for _, w in profile]
    return pts, ws, (ux, uy)


def circle(cx, cy, r):
    """真正以 (cx,cy) 为心的圆。

    `M x y a r r 0 1 0 0.0001 0 Z` 那个写法画出来的圆心在起点旁边偏 r，
    眼珠和眼白用不同半径时就不同心 —— 瞳孔会跑到眼眶边上。
    """
    return (f"M{cx - r:.4f} {cy:.4f} a{r:.4f} {r:.4f} 0 1 0 {2 * r:.4f} 0 "
            f"a{r:.4f} {r:.4f} 0 1 0 {-2 * r:.4f} 0 Z")
